// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DIDRegistry.sol";
import "./AccessControl.sol";

/**
 * @title AgentRegistry
 * @notice Registre des agents P2P + mécanisme d'élection pour DecentrAccess
 * @dev R11: forceDeregister par SUPER_ADMIN, R12: getOnlineAgents (tous, pas juste executors)
 */
contract AgentRegistry {

    DIDRegistry   public didRegistry;
    AccessControl public accessControl;  // R11: nécessaire pour vérifier SUPER_ADMIN

    struct AgentNode {
        address agentAddress;
        string  hostname;
        bool    canExecuteAD;
        string  peerId;
        uint256 registeredAt;
        uint256 lastHeartbeat;
        bool    active;
    }

    // State
    mapping(address => AgentNode) private _agents;
    address[] private _activeAgents;
    address[] private _executors;
    
    uint256 public constant HEARTBEAT_TIMEOUT = 5 minutes;
    uint256 public constant FAILOVER_TIMEOUT  = 30 seconds;

    // Events
    event AgentRegistered(address indexed agent, string hostname, bool canExecuteAD, uint256 timestamp);
    event AgentDeregistered(address indexed agent, uint256 timestamp);
    // R11: Event pour désenregistrement forcé
    event AgentForceDeregistered(address indexed agent, address indexed deregisteredBy, uint256 timestamp);
    event AgentHeartbeat(address indexed agent, uint256 timestamp);
    event AgentOffline(address indexed agent, uint256 lastSeen);
    event AgentCapabilityUpdated(address indexed agent, bool canExecuteAD);
    event ExecutorElected(bytes32 indexed actionId, address indexed executor);

    constructor(address _didRegistry, address _accessControl) {
        didRegistry   = DIDRegistry(_didRegistry);
        accessControl = AccessControl(_accessControl);
    }

    /**
     * @notice Enregistre un nouvel agent
     */
    function registerAgent(
        string memory _hostname,
        bool _canExecuteAD,
        string memory _peerId
    ) external {
        require(didRegistry.isDIDActive(msg.sender), "AgentRegistry: DID not active");
        require(_agents[msg.sender].registeredAt == 0, "AgentRegistry: already registered");

        _agents[msg.sender] = AgentNode({
            agentAddress: msg.sender,
            hostname: _hostname,
            canExecuteAD: _canExecuteAD,
            peerId: _peerId,
            registeredAt: block.timestamp,
            lastHeartbeat: block.timestamp,
            active: true
        });

        _activeAgents.push(msg.sender);
        if (_canExecuteAD) {
            _executors.push(msg.sender);
        }

        emit AgentRegistered(msg.sender, _hostname, _canExecuteAD, block.timestamp);
    }

    /**
     * @notice Met à jour le heartbeat de l'agent
     */
    function heartbeat() external {
        require(_agents[msg.sender].active, "AgentRegistry: agent not active");
        _agents[msg.sender].lastHeartbeat = block.timestamp;
        emit AgentHeartbeat(msg.sender, block.timestamp);
    }

    /**
     * @notice Désenregistre son propre agent
     */
    function deregisterAgent() external {
        require(_agents[msg.sender].active, "AgentRegistry: not active");
        _agents[msg.sender].active = false;

        _removeFromArray(_activeAgents, msg.sender);
        if (_agents[msg.sender].canExecuteAD) {
            _removeFromArray(_executors, msg.sender);
        }

        emit AgentDeregistered(msg.sender, block.timestamp);
    }

    /**
     * @notice R11: Désenregistre un agent par SUPER_ADMIN (agent compromis/malveillant)
     */
    function forceDeregister(address _agent) external {
        require(
            accessControl.hasRole(msg.sender, accessControl.SUPER_ADMIN()),
            "AgentRegistry: only SUPER_ADMIN"
        );
        require(_agents[_agent].active, "AgentRegistry: not active");

        _agents[_agent].active = false;
        _removeFromArray(_activeAgents, _agent);
        if (_agents[_agent].canExecuteAD) {
            _removeFromArray(_executors, _agent);
        }

        emit AgentForceDeregistered(_agent, msg.sender, block.timestamp);
    }

    /**
     * @notice Met à jour la capacité AD d'un agent
     */
    function updateCapability(bool _canExecuteAD) external {
        require(_agents[msg.sender].active, "AgentRegistry: not active");
        
        bool wasExecutor = _agents[msg.sender].canExecuteAD;
        _agents[msg.sender].canExecuteAD = _canExecuteAD;

        if (_canExecuteAD && !wasExecutor) {
            _executors.push(msg.sender);
        } else if (!_canExecuteAD && wasExecutor) {
            _removeFromArray(_executors, msg.sender);
        }

        emit AgentCapabilityUpdated(msg.sender, _canExecuteAD);
    }

    // ═══════════ Élection ═══════════

    /**
     * @notice Élit un agent exécutant pour une action
     */
    function electExecutor(bytes32 _actionId) external view returns (address executor) {
        address[] memory onlineExecutors = getOnlineExecutors();
        require(onlineExecutors.length > 0, "AgentRegistry: no executor available");

        uint256 index = uint256(_actionId) % onlineExecutors.length;
        return onlineExecutors[index];
    }

    /**
     * @notice Élit un agent de remplacement (failover)
     */
    function electFailover(
        bytes32 _actionId, 
        address _failedExecutor
    ) external view returns (address executor) {
        address[] memory onlineExecutors = getOnlineExecutors();
        require(onlineExecutors.length > 1, "AgentRegistry: no failover available");

        uint256 baseIndex = uint256(_actionId) % onlineExecutors.length;
        for (uint256 i = 1; i < onlineExecutors.length; i++) {
            uint256 nextIndex = (baseIndex + i) % onlineExecutors.length;
            if (onlineExecutors[nextIndex] != _failedExecutor) {
                return onlineExecutors[nextIndex];
            }
        }
        revert("AgentRegistry: failover impossible");
    }

    // ═══════════ Vues ═══════════

    function getAgent(address _agent) external view returns (AgentNode memory) {
        return _agents[_agent];
    }

    function getActiveAgents() external view returns (address[] memory) {
        return _activeAgents;
    }

    function getExecutors() external view returns (address[] memory) {
        return _executors;
    }

    /**
     * @notice Retourne les agents exécutants actuellement en ligne
     */
    function getOnlineExecutors() public view returns (address[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < _executors.length; i++) {
            if (_isOnline(_executors[i])) count++;
        }

        address[] memory online = new address[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < _executors.length; i++) {
            if (_isOnline(_executors[i])) {
                online[idx] = _executors[i];
                idx++;
            }
        }
        return online;
    }

    /**
     * @notice R12: Retourne TOUS les agents actuellement en ligne (pas juste executors)
     */
    function getOnlineAgents() public view returns (address[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < _activeAgents.length; i++) {
            if (_isOnline(_activeAgents[i])) count++;
        }

        address[] memory online = new address[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < _activeAgents.length; i++) {
            if (_isOnline(_activeAgents[i])) {
                online[idx] = _activeAgents[i];
                idx++;
            }
        }
        return online;
    }

    function isAgentOnline(address _agent) external view returns (bool) {
        return _isOnline(_agent);
    }

    function getActiveAgentCount() external view returns (uint256) {
        return _activeAgents.length;
    }

    function getExecutorCount() external view returns (uint256) {
        return _executors.length;
    }

    /**
     * @notice R12: Nombre d'agents en ligne (pour le dashboard)
     */
    function getOnlineAgentCount() external view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < _activeAgents.length; i++) {
            if (_isOnline(_activeAgents[i])) count++;
        }
        return count;
    }

    // ═══════════ Internal ═══════════

    function _isOnline(address _agent) internal view returns (bool) {
        AgentNode storage agent = _agents[_agent];
        return agent.active && (block.timestamp - agent.lastHeartbeat <= HEARTBEAT_TIMEOUT);
    }

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
