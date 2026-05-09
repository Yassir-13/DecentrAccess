// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DIDRegistry.sol";
import "./AccessControl.sol";

/**
 * @title PolicyEngine
 * @notice Politiques on-chain + Multi-signature + Vote pour DecentrAccess
 * @dev R6: executeAction restreint, R7: expiryPeriod configurable, R8: removeApproval, R9: getAllPolicyTypes
 * @dev B6: executeRoleAction() — exécute une décision de rôle après multi-sig
 */
contract PolicyEngine {

    DIDRegistry   public didRegistry;
    AccessControl public accessControl;

    struct Policy {
        string  actionType;
        bytes32 minimumRole;
        bool    requiresMultiSig;
        uint8   requiredSignatures;
        uint256 cooldownPeriod;
        uint256 expiryPeriod;      // R7: configurable par policy (0 = défaut 24h)
        bool    active;
    }

    struct PendingAction {
        bytes32   actionId;
        string    actionType;
        address   initiator;
        bytes     actionData;
        address[] approvers;
        uint256   createdAt;
        uint256   expiresAt;
        bool      executed;
        bool      cancelled;
    }

    // State
    mapping(string  => Policy)        private _policies;
    mapping(bytes32 => PendingAction) private _pendingActions;
    bytes32[] private _pendingActionIds;
    string[]  private _policyTypes;

    uint256 public constant DEFAULT_EXPIRY = 24 hours;

    // Events
    event PolicyCreated(string actionType, bytes32 minimumRole, bool requiresMultiSig, uint8 requiredSignatures, uint256 expiryPeriod);
    event PolicyUpdated(string actionType, bytes32 minimumRole, bool requiresMultiSig, uint8 requiredSignatures, uint256 expiryPeriod);
    event ActionSubmitted(bytes32 indexed actionId, address indexed initiator, string actionType, uint256 expiresAt);
    event ActionApproved(bytes32 indexed actionId, address indexed approver, uint8 currentApprovals, uint8 required);
    // R8: Event pour retrait d'approbation
    event ApprovalRemoved(bytes32 indexed actionId, address indexed approver, uint8 remainingApprovals);
    event ActionExecuted(bytes32 indexed actionId, address indexed executor, uint256 timestamp);
    event ActionCancelled(bytes32 indexed actionId, address indexed cancelledBy, uint256 timestamp);
    // B6: Event pour exécution d'une action de rôle
    event RoleActionExecuted(bytes32 indexed actionId, string actionType, address indexed target, bytes32 role, address indexed executor);

    constructor(address _didRegistry, address _accessControl) {
        didRegistry   = DIDRegistry(_didRegistry);
        accessControl = AccessControl(_accessControl);

        // Politiques par défaut (R7: expiryPeriod inclus)
        _createPolicy("CREATE_USER",    AccessControl(_accessControl).ADMIN(), false, 0, 0, 0);
        _createPolicy("DELETE_USER",    AccessControl(_accessControl).ADMIN(), true,  2, 1 hours, 6 hours);
        _createPolicy("MODIFY_USER",    AccessControl(_accessControl).OPERATOR(), false, 0, 0, 0);
        _createPolicy("RESET_PASSWORD", AccessControl(_accessControl).OPERATOR(), false, 0, 0, 0);
        _createPolicy("CREATE_GROUP",   AccessControl(_accessControl).ADMIN(), false, 0, 0, 0);
        _createPolicy("REVOKE_ADMIN",   AccessControl(_accessControl).SUPER_ADMIN(), true, 2, 12 hours, 48 hours);
        _createPolicy("DEACTIVATE_DID", AccessControl(_accessControl).SUPER_ADMIN(), true, 2, 12 hours, 48 hours);

        // B6: Politiques de gestion des rôles
        // GRANT_OPERATOR : 1 seule signature ADMIN suffit
        _createPolicy("GRANT_OPERATOR", AccessControl(_accessControl).ADMIN(), true, 1, 0, 0);
        // GRANT_ADMIN : 2 signatures ADMIN requises (action critique)
        _createPolicy("GRANT_ADMIN",    AccessControl(_accessControl).ADMIN(), true, 2, 0, 0);
        // GRANT_AUDITOR : 1 seule signature ADMIN suffit
        _createPolicy("GRANT_AUDITOR",  AccessControl(_accessControl).ADMIN(), true, 1, 0, 0);
        // REVOKE_ROLE : 2 signatures ADMIN requises
        _createPolicy("REVOKE_ROLE",    AccessControl(_accessControl).ADMIN(), true, 2, 0, 0);
        // ACTIVATE_USER / DISABLE_USER / ENABLE_USER : 1 signature ADMIN
        _createPolicy("ACTIVATE_USER",  AccessControl(_accessControl).ADMIN(), true, 1, 0, 0);
        _createPolicy("DISABLE_USER",   AccessControl(_accessControl).OPERATOR(), true, 1, 0, 0);
        _createPolicy("ENABLE_USER",    AccessControl(_accessControl).OPERATOR(), true, 1, 0, 0);
    }

    // ═══════════ Gestion des Politiques ═══════════

    /**
     * @notice Crée ou met à jour une politique
     * @dev R7: expiryPeriod configurable (0 = défaut 24h)
     */
    function createPolicy(
        string memory _actionType,
        bytes32 _minimumRole,
        bool _requiresMultiSig,
        uint8 _requiredSignatures,
        uint256 _cooldownPeriod,
        uint256 _expiryPeriod
    ) external {
        require(
            accessControl.hasRole(msg.sender, accessControl.SUPER_ADMIN()),
            "PolicyEngine: only SUPER_ADMIN"
        );
        _createPolicy(_actionType, _minimumRole, _requiresMultiSig, _requiredSignatures, _cooldownPeriod, _expiryPeriod);
    }

    /**
     * @notice Évalue si une action est autorisée et si elle nécessite un multi-sig
     */
    function evaluatePolicy(
        address _requester,
        string memory _actionType
    ) external view returns (bool allowed, bool needsMultiSig, uint8 sigsRequired) {
        Policy storage policy = _policies[_actionType];
        if (!policy.active) return (false, false, 0);

        allowed = accessControl.canPerform(_requester, _actionType);
        needsMultiSig = policy.requiresMultiSig;
        sigsRequired = policy.requiredSignatures;
    }

    // ═══════════ Actions Multi-Sig ═══════════

    /**
     * @notice Soumet une action qui nécessite un multi-sig
     */
    function submitAction(
        string memory _actionType,
        bytes memory _actionData
    ) external returns (bytes32 actionId) {
        require(didRegistry.isDIDActive(msg.sender), "PolicyEngine: DID not active");
        require(accessControl.canPerform(msg.sender, _actionType), "PolicyEngine: no permission");

        Policy storage policy = _policies[_actionType];
        require(policy.active, "PolicyEngine: policy not found");
        require(policy.requiresMultiSig, "PolicyEngine: not multi-sig, execute directly");

        actionId = keccak256(abi.encodePacked(
            msg.sender, _actionType, _actionData, block.timestamp
        ));

        // R7: utiliser expiryPeriod de la policy ou le défaut
        uint256 expiry = policy.expiryPeriod > 0 ? policy.expiryPeriod : DEFAULT_EXPIRY;

        address[] memory initialApprovers = new address[](1);
        initialApprovers[0] = msg.sender;

        _pendingActions[actionId] = PendingAction({
            actionId: actionId,
            actionType: _actionType,
            initiator: msg.sender,
            actionData: _actionData,
            approvers: initialApprovers,
            createdAt: block.timestamp,
            expiresAt: block.timestamp + expiry,
            executed: false,
            cancelled: false
        });

        _pendingActionIds.push(actionId);

        emit ActionSubmitted(actionId, msg.sender, _actionType, block.timestamp + expiry);
        emit ActionApproved(actionId, msg.sender, 1, policy.requiredSignatures);

        return actionId;
    }

    /**
     * @notice Approuve une action en attente
     */
    function approveAction(bytes32 _actionId) external {
        PendingAction storage action = _pendingActions[_actionId];
        require(action.createdAt != 0, "PolicyEngine: action not found");
        require(!action.executed, "PolicyEngine: already executed");
        require(!action.cancelled, "PolicyEngine: cancelled");
        require(block.timestamp < action.expiresAt, "PolicyEngine: expired");
        require(didRegistry.isDIDActive(msg.sender), "PolicyEngine: DID not active");
        require(
            accessControl.canPerform(msg.sender, action.actionType),
            "PolicyEngine: no permission"
        );

        // Vérifier que l'approuveur n'a pas déjà approuvé
        for (uint i = 0; i < action.approvers.length; i++) {
            require(action.approvers[i] != msg.sender, "PolicyEngine: already approved");
        }

        action.approvers.push(msg.sender);

        Policy storage policy = _policies[action.actionType];
        emit ActionApproved(
            _actionId, 
            msg.sender, 
            uint8(action.approvers.length), 
            policy.requiredSignatures
        );
    }

    /**
     * @notice R8: Retire son approbation d'une action en attente
     * @dev L'initiateur ne peut pas retirer (doit utiliser cancelAction)
     */
    function removeApproval(bytes32 _actionId) external {
        PendingAction storage action = _pendingActions[_actionId];
        require(action.createdAt != 0, "PolicyEngine: action not found");
        require(!action.executed, "PolicyEngine: already executed");
        require(!action.cancelled, "PolicyEngine: cancelled");
        require(msg.sender != action.initiator, "PolicyEngine: initiator must cancel instead");

        bool found = false;
        for (uint i = 0; i < action.approvers.length; i++) {
            if (action.approvers[i] == msg.sender) {
                action.approvers[i] = action.approvers[action.approvers.length - 1];
                action.approvers.pop();
                found = true;
                break;
            }
        }
        require(found, "PolicyEngine: not an approver");

        emit ApprovalRemoved(_actionId, msg.sender, uint8(action.approvers.length));
    }

    /**
     * @notice Exécute une action approuvée (retourne les données pour l'agent)
     * @dev R6: Seuls les approvers peuvent exécuter
     */
    function executeAction(bytes32 _actionId) external returns (bytes memory) {
        PendingAction storage action = _pendingActions[_actionId];
        require(action.createdAt != 0, "PolicyEngine: action not found");
        require(!action.executed, "PolicyEngine: already executed");
        require(!action.cancelled, "PolicyEngine: cancelled");
        require(block.timestamp < action.expiresAt, "PolicyEngine: expired");

        // R6: Vérifier que l'appelant est un des approvers
        bool isApprover = false;
        for (uint i = 0; i < action.approvers.length; i++) {
            if (action.approvers[i] == msg.sender) {
                isApprover = true;
                break;
            }
        }
        require(isApprover, "PolicyEngine: only approvers can execute");

        Policy storage policy = _policies[action.actionType];
        require(
            action.approvers.length >= policy.requiredSignatures,
            "PolicyEngine: not enough signatures"
        );

        // Vérifier le cooldown
        if (policy.cooldownPeriod > 0) {
            require(
                block.timestamp >= action.createdAt + policy.cooldownPeriod,
                "PolicyEngine: cooldown not elapsed"
            );
        }

        action.executed = true;
        emit ActionExecuted(_actionId, msg.sender, block.timestamp);

        return action.actionData;
    }

    /**
     * @notice B6: Exécute une action de rôle après validation multi-sig
     * @dev Appelle directement AccessControl.grantRole() ou revokeRole()
     * @dev À utiliser pour : GRANT_OPERATOR, GRANT_ADMIN, GRANT_AUDITOR, REVOKE_ROLE
     * @param _actionId ID de l'action en attente
     */
    function executeRoleAction(bytes32 _actionId) external {
        PendingAction storage action = _pendingActions[_actionId];
        require(action.createdAt != 0, "PolicyEngine: action not found");
        require(!action.executed, "PolicyEngine: already executed");
        require(!action.cancelled, "PolicyEngine: cancelled");
        require(block.timestamp < action.expiresAt, "PolicyEngine: expired");

        // Vérifier que l'appelant est un des approvers
        bool isApprover = false;
        for (uint i = 0; i < action.approvers.length; i++) {
            if (action.approvers[i] == msg.sender) {
                isApprover = true;
                break;
            }
        }
        require(isApprover, "PolicyEngine: only approvers can execute");

        Policy storage policy = _policies[action.actionType];
        require(
            action.approvers.length >= policy.requiredSignatures,
            "PolicyEngine: not enough signatures"
        );

        action.executed = true;

        // Décoder (target, role) depuis actionData
        // Pour REVOKE_ROLE : actionData = abi.encode(target, bytes32(0))
        // Pour GRANT_* : actionData = abi.encode(target, roleBytes32)
        (address target, bytes32 role) = abi.decode(action.actionData, (address, bytes32));

        if (keccak256(bytes(action.actionType)) == keccak256(bytes("REVOKE_ROLE"))) {
            accessControl.revokeRole(target);
            emit RoleActionExecuted(_actionId, action.actionType, target, bytes32(0), msg.sender);
        } else {
            accessControl.grantRole(target, role);
            emit RoleActionExecuted(_actionId, action.actionType, target, role, msg.sender);
        }

        emit ActionExecuted(_actionId, msg.sender, block.timestamp);
    }

    /**
     * @notice Annule une action en attente
     */
    function cancelAction(bytes32 _actionId) external {
        PendingAction storage action = _pendingActions[_actionId];
        require(action.createdAt != 0, "PolicyEngine: action not found");
        require(!action.executed, "PolicyEngine: already executed");
        require(
            msg.sender == action.initiator || 
            accessControl.hasRole(msg.sender, accessControl.SUPER_ADMIN()),
            "PolicyEngine: not authorized"
        );

        action.cancelled = true;
        emit ActionCancelled(_actionId, msg.sender, block.timestamp);
    }

    // ═══════════ Vues ═══════════

    function getPolicy(string memory _actionType) external view returns (Policy memory) {
        return _policies[_actionType];
    }

    function getPendingAction(bytes32 _actionId) external view returns (PendingAction memory) {
        return _pendingActions[_actionId];
    }

    function getPendingActionIds() external view returns (bytes32[] memory) {
        return _pendingActionIds;
    }

    function getApprovers(bytes32 _actionId) external view returns (address[] memory) {
        return _pendingActions[_actionId].approvers;
    }

    /**
     * @notice R9: Retourne tous les types de policies définies
     */
    function getAllPolicyTypes() external view returns (string[] memory) {
        return _policyTypes;
    }

    function isActionReady(bytes32 _actionId) external view returns (bool) {
        PendingAction storage action = _pendingActions[_actionId];
        if (action.executed || action.cancelled) return false;
        if (block.timestamp >= action.expiresAt) return false;

        Policy storage policy = _policies[action.actionType];
        if (action.approvers.length < policy.requiredSignatures) return false;
        if (policy.cooldownPeriod > 0 && block.timestamp < action.createdAt + policy.cooldownPeriod) return false;

        return true;
    }

    // ═══════════ Internal ═══════════

    function _createPolicy(
        string memory _actionType,
        bytes32 _minimumRole,
        bool _requiresMultiSig,
        uint8 _requiredSignatures,
        uint256 _cooldownPeriod,
        uint256 _expiryPeriod
    ) internal {
        bool isNew = !_policies[_actionType].active;

        _policies[_actionType] = Policy({
            actionType: _actionType,
            minimumRole: _minimumRole,
            requiresMultiSig: _requiresMultiSig,
            requiredSignatures: _requiredSignatures,
            cooldownPeriod: _cooldownPeriod,
            expiryPeriod: _expiryPeriod,
            active: true
        });

        if (isNew) {
            _policyTypes.push(_actionType);
            emit PolicyCreated(_actionType, _minimumRole, _requiresMultiSig, _requiredSignatures, _expiryPeriod);
        } else {
            emit PolicyUpdated(_actionType, _minimumRole, _requiresMultiSig, _requiredSignatures, _expiryPeriod);
        }
    }
}
