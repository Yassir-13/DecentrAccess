// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DIDRegistry.sol";
import "./AccessControl.sol";

/**
 * @title EmergencyRecovery
 * @notice Récupération d'urgence décentralisée
 * @dev Si un SUPER_ADMIN perd sa clé ou si un admin est compromis,
 *      ce contrat permet une récupération via multi-sig avec délai de sécurité.
 */
contract EmergencyRecovery {

    DIDRegistry   public didRegistry;
    AccessControl public accessControl;

    enum RecoveryType { REPLACE_ADMIN, REVOKE_ADMIN, ROTATE_KEY }

    struct RecoveryRequest {
        bytes32      requestId;
        RecoveryType recoveryType;
        address      targetAccount;     // Admin à remplacer/révoquer
        address      newAccount;        // Nouvel admin (si REPLACE_ADMIN, sinon address(0))
        address      initiator;
        address[]    approvers;
        uint256      createdAt;
        uint256      executionDelay;    // Délai avant exécution
        bool         executed;
        bool         cancelled;
    }

    // State
    mapping(bytes32 => RecoveryRequest) private _requests;
    bytes32[] private _requestIds;

    uint8   public constant RECOVERY_THRESHOLD = 3;    // 3 signatures minimum
    uint256 public constant MIN_DELAY          = 48 hours;
    uint256 public constant RECOVERY_EXPIRY    = 7 days;  // B9 Fix: requests expirent après 7 jours

    // Liste des "recovery guardians" — admins de confiance pré-approuvés
    mapping(address => bool) public isGuardian;
    address[] private _guardians;

    // Events
    event RecoveryInitiated(bytes32 indexed requestId, RecoveryType recoveryType, address target, address newAccount, address initiator);
    event RecoveryApproved(bytes32 indexed requestId, address indexed approver, uint8 currentApprovals, uint8 required);
    event RecoveryExecuted(bytes32 indexed requestId, RecoveryType recoveryType, address target, uint256 timestamp);
    event RecoveryCancelled(bytes32 indexed requestId, address cancelledBy, uint256 timestamp);
    event GuardianAdded(address indexed guardian, address addedBy);
    event GuardianRemoved(address indexed guardian, address removedBy);

    constructor(address _didRegistry, address _accessControl) {
        didRegistry   = DIDRegistry(_didRegistry);
        accessControl = AccessControl(_accessControl);
    }

    // ═══════════ Gestion des Guardians ═══════════

    /**
     * @notice Ajoute un guardian de récupération (SUPER_ADMIN uniquement)
     * @dev Les guardians sont des admins de confiance qui approuvent les récupérations
     */
    function addGuardian(address _guardian) external {
        require(
            accessControl.hasRole(msg.sender, accessControl.SUPER_ADMIN()),
            "EmergencyRecovery: only SUPER_ADMIN"
        );
        require(didRegistry.isDIDActive(_guardian), "EmergencyRecovery: DID not active");
        require(!isGuardian[_guardian], "EmergencyRecovery: already guardian");

        isGuardian[_guardian] = true;
        _guardians.push(_guardian);

        emit GuardianAdded(_guardian, msg.sender);
    }

    /**
     * @notice Retire un guardian
     */
    function removeGuardian(address _guardian) external {
        require(
            accessControl.hasRole(msg.sender, accessControl.SUPER_ADMIN()),
            "EmergencyRecovery: only SUPER_ADMIN"
        );
        require(isGuardian[_guardian], "EmergencyRecovery: not guardian");

        isGuardian[_guardian] = false;
        _removeFromArray(_guardians, _guardian);

        emit GuardianRemoved(_guardian, msg.sender);
    }

    // ═══════════ Récupération ═══════════

    /**
     * @notice Initie une demande de récupération d'urgence
     * @dev N'importe quel guardian peut initier une récupération
     */
    function initiateRecovery(
        RecoveryType _type,
        address _target,
        address _newAccount
    ) external returns (bytes32 requestId) {
        require(isGuardian[msg.sender], "EmergencyRecovery: not guardian");
        require(didRegistry.isDIDActive(msg.sender), "EmergencyRecovery: DID not active");

        if (_type == RecoveryType.REPLACE_ADMIN) {
            require(_newAccount != address(0), "EmergencyRecovery: newAccount required");
            require(didRegistry.isDIDActive(_newAccount), "EmergencyRecovery: new DID not active");
        }

        requestId = keccak256(abi.encodePacked(
            _type, _target, _newAccount, msg.sender, block.timestamp
        ));

        address[] memory initialApprovers = new address[](1);
        initialApprovers[0] = msg.sender;

        _requests[requestId] = RecoveryRequest({
            requestId: requestId,
            recoveryType: _type,
            targetAccount: _target,
            newAccount: _newAccount,
            initiator: msg.sender,
            approvers: initialApprovers,
            createdAt: block.timestamp,
            executionDelay: MIN_DELAY,
            executed: false,
            cancelled: false
        });

        _requestIds.push(requestId);

        emit RecoveryInitiated(requestId, _type, _target, _newAccount, msg.sender);
        emit RecoveryApproved(requestId, msg.sender, 1, RECOVERY_THRESHOLD);

        return requestId;
    }

    /**
     * @notice Approuve une demande de récupération
     */
    function approveRecovery(bytes32 _requestId) external {
        require(isGuardian[msg.sender], "EmergencyRecovery: not guardian");
        require(didRegistry.isDIDActive(msg.sender), "EmergencyRecovery: DID not active");

        RecoveryRequest storage req = _requests[_requestId];
        require(req.createdAt != 0, "EmergencyRecovery: not found");
        require(!req.executed, "EmergencyRecovery: already executed");
        require(!req.cancelled, "EmergencyRecovery: cancelled");
        require(block.timestamp < req.createdAt + RECOVERY_EXPIRY, "EmergencyRecovery: expired");

        // Vérifier double vote
        for (uint i = 0; i < req.approvers.length; i++) {
            require(req.approvers[i] != msg.sender, "EmergencyRecovery: already approved");
        }

        req.approvers.push(msg.sender);

        emit RecoveryApproved(_requestId, msg.sender, uint8(req.approvers.length), RECOVERY_THRESHOLD);
    }

    /**
     * @notice Exécute une récupération après le délai de sécurité
     */
    function executeRecovery(bytes32 _requestId) external {
        RecoveryRequest storage req = _requests[_requestId];
        require(req.createdAt != 0, "EmergencyRecovery: not found");
        require(!req.executed, "EmergencyRecovery: already executed");
        require(!req.cancelled, "EmergencyRecovery: cancelled");
        require(req.approvers.length >= RECOVERY_THRESHOLD, "EmergencyRecovery: not enough approvals");
        require(
            block.timestamp >= req.createdAt + req.executionDelay,
            "EmergencyRecovery: delay not elapsed"
        );
        require(
            block.timestamp < req.createdAt + RECOVERY_EXPIRY,
            "EmergencyRecovery: expired"
        );

        // Vérifier que l'appelant est un des approvers
        bool isApprover = false;
        for (uint i = 0; i < req.approvers.length; i++) {
            if (req.approvers[i] == msg.sender) {
                isApprover = true;
                break;
            }
        }
        require(isApprover, "EmergencyRecovery: only approvers can execute");

        req.executed = true;

        // NOTE: L'exécution réelle (revokeRole, grantRole, etc.) doit être faite 
        // manuellement par le SUPER_ADMIN après validation de cette récupération,
        // ou via un mécanisme d'interaction inter-contrats configuré séparément.
        // Ce contrat sert de PREUVE de consensus décentralisé.

        emit RecoveryExecuted(_requestId, req.recoveryType, req.targetAccount, block.timestamp);
    }

    /**
     * @notice Annule une demande de récupération
     * @dev L'initiateur ou le SUPER_ADMIN peut annuler
     */
    function cancelRecovery(bytes32 _requestId) external {
        RecoveryRequest storage req = _requests[_requestId];
        require(req.createdAt != 0, "EmergencyRecovery: not found");
        require(!req.executed, "EmergencyRecovery: already executed");
        require(
            msg.sender == req.initiator || 
            accessControl.hasRole(msg.sender, accessControl.SUPER_ADMIN()),
            "EmergencyRecovery: not authorized"
        );

        req.cancelled = true;
        emit RecoveryCancelled(_requestId, msg.sender, block.timestamp);
    }

    // ═══════════ Vues ═══════════

    function getRecoveryRequest(bytes32 _requestId) external view returns (RecoveryRequest memory) {
        return _requests[_requestId];
    }

    function getApprovers(bytes32 _requestId) external view returns (address[] memory) {
        return _requests[_requestId].approvers;
    }

    function getGuardians() external view returns (address[] memory) {
        return _guardians;
    }

    function getGuardianCount() external view returns (uint256) {
        return _guardians.length;
    }

    function getAllRequestIds() external view returns (bytes32[] memory) {
        return _requestIds;
    }

    function isRecoveryReady(bytes32 _requestId) external view returns (bool) {
        RecoveryRequest storage req = _requests[_requestId];
        if (req.executed || req.cancelled) return false;
        if (block.timestamp >= req.createdAt + RECOVERY_EXPIRY) return false;
        if (req.approvers.length < RECOVERY_THRESHOLD) return false;
        if (block.timestamp < req.createdAt + req.executionDelay) return false;
        return true;
    }

    // ═══════════ Internal ═══════════

    function _removeFromArray(address[] storage arr, address _addr) internal {
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] == _addr) {
                arr[i] = arr[arr.length - 1];
                arr.pop();
                break;
            }
        }
    }
}
