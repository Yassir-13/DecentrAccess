// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DIDRegistry.sol";

/**
 * @title AccessControl
 * @notice RBAC on-chain modifiable pour DecentrAccess
 * @dev R2: SuperAdminTransferred event, R3: changeRole atomique, R4: validRole modifier, R5: transferSuperAdmin protégé
 */
contract AccessControl {

    DIDRegistry public didRegistry;

    // Rôles
    bytes32 public constant SUPER_ADMIN = keccak256("SUPER_ADMIN");
    bytes32 public constant ADMIN       = keccak256("ADMIN");
    bytes32 public constant OPERATOR    = keccak256("OPERATOR");
    bytes32 public constant AUDITOR     = keccak256("AUDITOR");

    struct RoleData {
        bytes32 role;
        uint256 grantedAt;
        address grantedBy;
        bool    active;
    }

    // State
    mapping(address => RoleData) private _roles;
    mapping(bytes32 => address[]) private _roleMembers;
    mapping(bytes32 => mapping(string => bool)) private _permissions;

    address public superAdmin;

    // R5: Protection du transfer SUPER_ADMIN
    address public policyEngineAddress;
    bool public superAdminTransferLocked = true;

    // Events
    event RoleGranted(address indexed account, bytes32 indexed role, address indexed grantedBy, uint256 timestamp);
    event RoleRevoked(address indexed account, bytes32 indexed role, address indexed revokedBy, uint256 timestamp);
    event PermissionSet(bytes32 indexed role, string action, bool allowed, uint256 timestamp);
    // R2: Event dédié pour transfer SUPER_ADMIN
    event SuperAdminTransferred(address indexed oldAdmin, address indexed newAdmin, uint256 timestamp);

    // Modifiers
    modifier onlySuperAdmin() {
        require(msg.sender == superAdmin, "AccessControl: not SUPER_ADMIN");
        _;
    }

    modifier hasActiveDID(address account) {
        require(didRegistry.isDIDActive(account), "AccessControl: DID not active");
        _;
    }

    // R4: Valider que le rôle est un des 4 définis
    modifier validRole(bytes32 _role) {
        require(
            _role == SUPER_ADMIN || _role == ADMIN || _role == OPERATOR || _role == AUDITOR,
            "AccessControl: invalid role"
        );
        _;
    }

    /**
     * @notice Initialise avec DIDRegistry et le premier SUPER_ADMIN
     */
    constructor(address _didRegistry) {
        didRegistry = DIDRegistry(_didRegistry);
        superAdmin = msg.sender;

        // Le déployeur est automatiquement SUPER_ADMIN
        _roles[msg.sender] = RoleData({
            role: SUPER_ADMIN,
            grantedAt: block.timestamp,
            grantedBy: msg.sender,
            active: true
        });
        _roleMembers[SUPER_ADMIN].push(msg.sender);

        // Permissions par défaut
        _setDefaultPermissions();
    }

    // R5: Setter pour l'adresse PolicyEngine (appelé une fois après déploiement)
    function setPolicyEngine(address _policyEngine) external onlySuperAdmin {
        require(policyEngineAddress == address(0), "AccessControl: PolicyEngine already set");
        policyEngineAddress = _policyEngine;
    }

    /**
     * @notice Attribue un rôle à un compte
     * @dev R4: validRole modifier vérifie que le rôle est valide
     */
    function grantRole(address _account, bytes32 _role) 
        external 
        onlySuperAdmin 
        hasActiveDID(_account) 
        validRole(_role)
    {
        require(_roles[_account].grantedAt == 0 || !_roles[_account].active, 
            "AccessControl: already has active role");

        _roles[_account] = RoleData({
            role: _role,
            grantedAt: block.timestamp,
            grantedBy: msg.sender,
            active: true
        });
        _roleMembers[_role].push(_account);

        emit RoleGranted(_account, _role, msg.sender, block.timestamp);
    }

    /**
     * @notice Révoque le rôle d'un compte
     */
    function revokeRole(address _account) external onlySuperAdmin {
        require(_roles[_account].active, "AccessControl: no active role");
        require(_account != superAdmin, "AccessControl: cannot revoke SUPER_ADMIN self");

        bytes32 role = _roles[_account].role;
        _roles[_account].active = false;

        _removeMember(role, _account);

        emit RoleRevoked(_account, role, msg.sender, block.timestamp);
    }

    /**
     * @notice R3: Change le rôle d'un compte en une seule transaction (atomique)
     * @dev Évite l'état temporaire sans rôle entre revoke + grant
     */
    function changeRole(address _account, bytes32 _newRole) 
        external 
        onlySuperAdmin 
        hasActiveDID(_account)
        validRole(_newRole)
    {
        require(_roles[_account].active, "AccessControl: no active role");
        require(_account != superAdmin, "AccessControl: cannot change SUPER_ADMIN role");

        bytes32 oldRole = _roles[_account].role;
        _removeMember(oldRole, _account);

        _roles[_account] = RoleData({
            role: _newRole,
            grantedAt: block.timestamp,
            grantedBy: msg.sender,
            active: true
        });
        _roleMembers[_newRole].push(_account);

        emit RoleRevoked(_account, oldRole, msg.sender, block.timestamp);
        emit RoleGranted(_account, _newRole, msg.sender, block.timestamp);
    }

    /**
     * @notice Définit une permission pour un rôle
     */
    function setPermission(bytes32 _role, string memory _action, bool _allowed) 
        external 
        onlySuperAdmin 
    {
        _permissions[_role][_action] = _allowed;
        emit PermissionSet(_role, _action, _allowed, block.timestamp);
    }

    /**
     * @notice Définit plusieurs permissions d'un coup
     */
    function batchSetPermissions(
        bytes32 _role, 
        string[] memory _actions, 
        bool[] memory _allowed
    ) external onlySuperAdmin {
        require(_actions.length == _allowed.length, "AccessControl: length mismatch");
        for (uint i = 0; i < _actions.length; i++) {
            _permissions[_role][_actions[i]] = _allowed[i];
            emit PermissionSet(_role, _actions[i], _allowed[i], block.timestamp);
        }
    }

    /**
     * @notice Vérifie si un compte a un rôle spécifique
     */
    function hasRole(address _account, bytes32 _role) external view returns (bool) {
        return _roles[_account].role == _role && _roles[_account].active;
    }

    /**
     * @notice Vérifie si un compte peut effectuer une action
     */
    function canPerform(address _account, string memory _action) external view returns (bool) {
        if (!_roles[_account].active) return false;
        bytes32 role = _roles[_account].role;
        return _permissions[role][_action];
    }

    /**
     * @notice Retourne les données de rôle d'un compte
     */
    function getRole(address _account) external view returns (RoleData memory) {
        return _roles[_account];
    }

    /**
     * @notice Retourne les membres d'un rôle
     */
    function getRoleMembers(bytes32 _role) external view returns (address[] memory) {
        return _roleMembers[_role];
    }

    /**
     * @notice R5: Transfère le SUPER_ADMIN (protégé par PolicyEngine multi-sig)
     * @dev Le transfer est verrouillé par défaut. PolicyEngine doit appeler unlockSuperAdminTransfer() d'abord.
     */
    function transferSuperAdmin(address _newSuperAdmin) external onlySuperAdmin hasActiveDID(_newSuperAdmin) {
        require(!superAdminTransferLocked, "AccessControl: transfer locked, use PolicyEngine");
        
        address oldAdmin = superAdmin;

        // B1 Fix: Désactiver l'ancien SUPER_ADMIN
        _roles[oldAdmin].active = false;
        _removeMember(SUPER_ADMIN, oldAdmin);
        
        _roles[_newSuperAdmin] = RoleData({
            role: SUPER_ADMIN,
            grantedAt: block.timestamp,
            grantedBy: oldAdmin,
            active: true
        });
        _roleMembers[SUPER_ADMIN].push(_newSuperAdmin);
        superAdmin = _newSuperAdmin;

        // Re-verrouiller immédiatement après le transfer
        superAdminTransferLocked = true;

        emit RoleRevoked(oldAdmin, SUPER_ADMIN, oldAdmin, block.timestamp);
        emit SuperAdminTransferred(oldAdmin, _newSuperAdmin, block.timestamp);
        emit RoleGranted(_newSuperAdmin, SUPER_ADMIN, oldAdmin, block.timestamp);
    }

    /**
     * @notice R5: Déverrouille le transfer de SUPER_ADMIN (appelé par PolicyEngine après multi-sig)
     */
    function unlockSuperAdminTransfer() external {
        require(msg.sender == policyEngineAddress, "AccessControl: only PolicyEngine");
        superAdminTransferLocked = false;
    }

    // ═══════════ Internal ═══════════

    function _removeMember(bytes32 _role, address _account) internal {
        address[] storage members = _roleMembers[_role];
        for (uint i = 0; i < members.length; i++) {
            if (members[i] == _account) {
                members[i] = members[members.length - 1];
                members.pop();
                break;
            }
        }
    }

    function _setDefaultPermissions() internal {
        // SUPER_ADMIN — tout
        string[11] memory allActions = [
            "CREATE_USER", "DELETE_USER", "MODIFY_USER", "RESET_PASSWORD",
            "CREATE_GROUP", "MODIFY_GROUP", "ADD_COMPUTER",
            "VIEW_USERS", "VIEW_LOGS", "MANAGE_POLICIES", "MANAGE_ROLES"
        ];
        for (uint i = 0; i < allActions.length; i++) {
            _permissions[SUPER_ADMIN][allActions[i]] = true;
        }

        // ADMIN — CRUD + view
        string[9] memory adminActions = [
            "CREATE_USER", "DELETE_USER", "MODIFY_USER", "RESET_PASSWORD",
            "CREATE_GROUP", "MODIFY_GROUP", "ADD_COMPUTER",
            "VIEW_USERS", "VIEW_LOGS"
        ];
        for (uint i = 0; i < adminActions.length; i++) {
            _permissions[ADMIN][adminActions[i]] = true;
        }

        // OPERATOR — modify + reset + view
        string[4] memory opActions = [
            "MODIFY_USER", "RESET_PASSWORD", "VIEW_USERS", "VIEW_LOGS"
        ];
        for (uint i = 0; i < opActions.length; i++) {
            _permissions[OPERATOR][opActions[i]] = true;
        }

        // AUDITOR — view only
        _permissions[AUDITOR]["VIEW_USERS"] = true;
        _permissions[AUDITOR]["VIEW_LOGS"] = true;
    }
}
