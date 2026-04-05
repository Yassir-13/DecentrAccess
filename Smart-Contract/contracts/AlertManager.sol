// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DIDRegistry.sol";
import "./AccessControl.sol";
import "./AuditLog.sol";

/**
 * @title AlertManager
 * @notice Alertes décentralisées — détection d'anomalies on-chain
 * @dev Les agents déclenchent des alertes basées sur des règles. Les admins les acquittent.
 */
contract AlertManager {

    DIDRegistry   public didRegistry;
    AccessControl public accessControl;
    AuditLog      public auditLog;

    enum Severity { LOW, MEDIUM, HIGH, CRITICAL }

    struct AlertRule {
        bytes32  ruleId;
        string   name;           // "BRUTE_FORCE", "UNAUTHORIZED_ACCESS"
        string   condition;      // Description humaine 
        Severity severity;
        bool     active;
        address  createdBy;
        uint256  createdAt;
    }

    struct Alert {
        uint256  alertId;
        bytes32  ruleId;
        Severity severity;
        string   description;
        string   ipfsCID;         // Détails complets sur IPFS
        address  triggeredBy;     // Agent qui a détecté
        uint256  timestamp;
        bool     acknowledged;
        address  acknowledgedBy;
        uint256  acknowledgedAt;
    }

    // State
    AlertRule[] private _rules;
    Alert[]     private _alerts;
    mapping(bytes32 => uint256) private _ruleIndex; // ruleId => index dans _rules
    mapping(bytes32 => bool) private _ruleExists;   // B2/B3 Fix: vérifier existence

    mapping(Severity => uint256[]) private _alertsBySeverity;
    mapping(address  => uint256[]) private _alertsByTriggerer;

    uint256 public activeAlertCount;

    // Events
    event RuleCreated(bytes32 indexed ruleId, string name, Severity severity, address createdBy);
    event RuleDeactivated(bytes32 indexed ruleId, address deactivatedBy);
    event AlertTriggered(uint256 indexed alertId, bytes32 indexed ruleId, Severity severity, string description, address triggeredBy);
    event AlertAcknowledged(uint256 indexed alertId, address indexed acknowledgedBy, uint256 timestamp);

    constructor(address _didRegistry, address _accessControl, address _auditLog) {
        didRegistry   = DIDRegistry(_didRegistry);
        accessControl = AccessControl(_accessControl);
        auditLog      = AuditLog(_auditLog);
    }

    // ═══════════ Gestion des Règles ═══════════

    /**
     * @notice Crée une règle d'alerte (ADMIN+)
     */
    function createRule(
        string memory _name,
        string memory _condition,
        Severity _severity
    ) external returns (bytes32 ruleId) {
        require(didRegistry.isDIDActive(msg.sender), "AlertManager: DID not active");
        require(
            accessControl.canPerform(msg.sender, "MANAGE_POLICIES"),
            "AlertManager: no permission"
        );

        ruleId = keccak256(abi.encodePacked(_name, msg.sender, block.timestamp));

        _rules.push(AlertRule({
            ruleId: ruleId,
            name: _name,
            condition: _condition,
            severity: _severity,
            active: true,
            createdBy: msg.sender,
            createdAt: block.timestamp
        }));

        _ruleIndex[ruleId] = _rules.length - 1;
        _ruleExists[ruleId] = true;

        emit RuleCreated(ruleId, _name, _severity, msg.sender);
        return ruleId;
    }

    /**
     * @notice Désactive une règle
     */
    function deactivateRule(bytes32 _ruleId) external {
        require(
            accessControl.canPerform(msg.sender, "MANAGE_POLICIES"),
            "AlertManager: no permission"
        );
        require(_ruleExists[_ruleId], "AlertManager: rule not found");
        uint256 idx = _ruleIndex[_ruleId];
        require(_rules[idx].active, "AlertManager: rule not active");

        _rules[idx].active = false;
        emit RuleDeactivated(_ruleId, msg.sender);
    }

    // ═══════════ Déclenchement ═══════════

    /**
     * @notice Déclenche une alerte (appelé par un agent ou le système)
     */
    function triggerAlert(
        bytes32 _ruleId,
        string memory _description,
        string memory _ipfsCID
    ) external returns (uint256 alertId) {
        require(didRegistry.isDIDActive(msg.sender), "AlertManager: DID not active");
        require(_ruleExists[_ruleId], "AlertManager: rule not found");

        uint256 idx = _ruleIndex[_ruleId];
        AlertRule storage rule = _rules[idx];
        require(rule.active, "AlertManager: rule not active");

        alertId = _alerts.length;
        _alerts.push(Alert({
            alertId: alertId,
            ruleId: _ruleId,
            severity: rule.severity,
            description: _description,
            ipfsCID: _ipfsCID,
            triggeredBy: msg.sender,
            timestamp: block.timestamp,
            acknowledged: false,
            acknowledgedBy: address(0),
            acknowledgedAt: 0
        }));

        _alertsBySeverity[rule.severity].push(alertId);
        _alertsByTriggerer[msg.sender].push(alertId);
        activeAlertCount++;

        emit AlertTriggered(alertId, _ruleId, rule.severity, _description, msg.sender);
        return alertId;
    }

    /**
     * @notice Acquitte une alerte (ADMIN+)
     */
    function acknowledgeAlert(uint256 _alertId) external {
        require(_alertId < _alerts.length, "AlertManager: invalid alert");
        require(didRegistry.isDIDActive(msg.sender), "AlertManager: DID not active");
        require(
            accessControl.canPerform(msg.sender, "VIEW_LOGS"),
            "AlertManager: no permission"
        );

        Alert storage alert = _alerts[_alertId];
        require(!alert.acknowledged, "AlertManager: already acknowledged");

        alert.acknowledged = true;
        alert.acknowledgedBy = msg.sender;
        alert.acknowledgedAt = block.timestamp;
        activeAlertCount--;

        emit AlertAcknowledged(_alertId, msg.sender, block.timestamp);
    }

    // ═══════════ Vues ═══════════

    function getAlert(uint256 _alertId) external view returns (Alert memory) {
        require(_alertId < _alerts.length, "AlertManager: invalid alert");
        return _alerts[_alertId];
    }

    function getAlertCount() external view returns (uint256) {
        return _alerts.length;
    }

    function getAlertsBySeverity(Severity _severity) external view returns (uint256[] memory) {
        return _alertsBySeverity[_severity];
    }

    function getAlertsByTriggerer(address _triggerer) external view returns (uint256[] memory) {
        return _alertsByTriggerer[_triggerer];
    }

    function getActiveAlerts() external view returns (Alert[] memory) {
        uint256 count = activeAlertCount;
        Alert[] memory result = new Alert[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < _alerts.length && idx < count; i++) {
            if (!_alerts[i].acknowledged) {
                result[idx] = _alerts[i];
                idx++;
            }
        }
        return result;
    }

    function getLatestAlerts(uint256 _count) external view returns (Alert[] memory) {
        uint256 total = _alerts.length;
        if (_count > total) _count = total;
        Alert[] memory result = new Alert[](_count);
        for (uint256 i = 0; i < _count; i++) {
            result[i] = _alerts[total - 1 - i];
        }
        return result;
    }

    function getRule(bytes32 _ruleId) external view returns (AlertRule memory) {
        return _rules[_ruleIndex[_ruleId]];
    }

    function getRuleCount() external view returns (uint256) {
        return _rules.length;
    }

    function getAllRules() external view returns (AlertRule[] memory) {
        return _rules;
    }
}
