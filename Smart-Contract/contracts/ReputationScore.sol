// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DIDRegistry.sol";
import "./AccessControl.sol";

/**
 * @title ReputationScore
 * @notice Score de réputation/confiance pour les admins et agents
 * @dev Chaque action réussie/échouée met à jour le score. Peut être utilisé 
 *      pour limiter les permissions ou bannir un agent suspect.
 */
contract ReputationScore {

    DIDRegistry   public didRegistry;
    AccessControl public accessControl;

    struct Reputation {
        int256  score;               // Score total (peut être négatif)
        uint256 actionsPerformed;    // Actions réussies
        uint256 actionsRejected;     // Actions rejetées/échouées
        uint256 alertsTriggered;     // Alertes causées
        uint256 multiSigApprovals;   // Participations multi-sig
        uint256 lastUpdated;
        bool    flagged;             // Signalé comme suspect
    }

    // Points système
    int256 public constant PTS_ACTION_SUCCESS   =  1;
    int256 public constant PTS_ACTION_REJECTED  = -2;
    int256 public constant PTS_ALERT_CAUSED     = -5;
    int256 public constant PTS_MULTISIG_VOTE    =  1;
    int256 public constant FLAG_THRESHOLD       = -10;  // Automatiquement signalé

    // State
    mapping(address => Reputation) private _reputations;
    address[] private _flaggedAccounts;

    // Events
    event ScoreUpdated(address indexed account, int256 newScore, string reason, uint256 timestamp);
    event AccountFlagged(address indexed account, int256 score, uint256 timestamp);
    event AccountUnflagged(address indexed account, address unflaggedBy, uint256 timestamp);

    constructor(address _didRegistry, address _accessControl) {
        didRegistry   = DIDRegistry(_didRegistry);
        accessControl = AccessControl(_accessControl);
    }

    // B4 Fix: seuls les contrats/agents autorisés peuvent appeler record*()
    mapping(address => bool) public authorizedCallers;

    function setAuthorizedCaller(address _caller, bool _authorized) external {
        require(
            accessControl.hasRole(msg.sender, accessControl.SUPER_ADMIN()),
            "ReputationScore: only SUPER_ADMIN"
        );
        authorizedCallers[_caller] = _authorized;
    }

    modifier onlyAuthorized() {
        require(
            authorizedCallers[msg.sender] || 
            accessControl.hasRole(msg.sender, accessControl.SUPER_ADMIN()),
            "ReputationScore: not authorized"
        );
        _;
    }

    /**
     * @notice Enregistre une action réussie (+1 point)
     * @dev Appelé par les agents après exécution réussie
     */
    function recordActionSuccess(address _account) external onlyAuthorized {
        require(didRegistry.isDIDActive(msg.sender), "ReputationScore: caller DID not active");

        Reputation storage rep = _reputations[_account];
        rep.actionsPerformed++;
        rep.score += PTS_ACTION_SUCCESS;
        rep.lastUpdated = block.timestamp;

        emit ScoreUpdated(_account, rep.score, "ACTION_SUCCESS", block.timestamp);
    }

    /**
     * @notice Enregistre une action rejetée (-2 points)
     * @dev Appelé quand une action est refusée (permission insuffisante, policy refusée)
     */
    function recordActionRejected(address _account) external onlyAuthorized {
        require(didRegistry.isDIDActive(msg.sender), "ReputationScore: caller DID not active");

        Reputation storage rep = _reputations[_account];
        rep.actionsRejected++;
        rep.score += PTS_ACTION_REJECTED;
        rep.lastUpdated = block.timestamp;

        _checkFlag(_account, rep);

        emit ScoreUpdated(_account, rep.score, "ACTION_REJECTED", block.timestamp);
    }

    /**
     * @notice Enregistre une alerte causée par un compte (-5 points)
     */
    function recordAlertCaused(address _account) external onlyAuthorized {
        require(didRegistry.isDIDActive(msg.sender), "ReputationScore: caller DID not active");

        Reputation storage rep = _reputations[_account];
        rep.alertsTriggered++;
        rep.score += PTS_ALERT_CAUSED;
        rep.lastUpdated = block.timestamp;

        _checkFlag(_account, rep);

        emit ScoreUpdated(_account, rep.score, "ALERT_CAUSED", block.timestamp);
    }

    /**
     * @notice Enregistre une participation à un vote multi-sig (+1 point)
     */
    function recordMultiSigApproval(address _account) external onlyAuthorized {
        require(didRegistry.isDIDActive(msg.sender), "ReputationScore: caller DID not active");

        Reputation storage rep = _reputations[_account];
        rep.multiSigApprovals++;
        rep.score += PTS_MULTISIG_VOTE;
        rep.lastUpdated = block.timestamp;

        emit ScoreUpdated(_account, rep.score, "MULTISIG_APPROVAL", block.timestamp);
    }

    /**
     * @notice Retire le flag d'un compte (SUPER_ADMIN uniquement)
     */
    function unflagAccount(address _account) external {
        require(
            accessControl.hasRole(msg.sender, accessControl.SUPER_ADMIN()),
            "ReputationScore: only SUPER_ADMIN"
        );
        require(_reputations[_account].flagged, "ReputationScore: not flagged");

        _reputations[_account].flagged = false;
        _removeFromFlagged(_account);

        emit AccountUnflagged(_account, msg.sender, block.timestamp);
    }

    /**
     * @notice Réinitialise le score d'un compte (SUPER_ADMIN uniquement)
     */
    function resetScore(address _account) external {
        require(
            accessControl.hasRole(msg.sender, accessControl.SUPER_ADMIN()),
            "ReputationScore: only SUPER_ADMIN"
        );

        Reputation storage rep = _reputations[_account];
        rep.score = 0;
        rep.actionsPerformed = 0;
        rep.actionsRejected = 0;
        rep.alertsTriggered = 0;
        rep.multiSigApprovals = 0;
        rep.flagged = false;
        rep.lastUpdated = block.timestamp;

        _removeFromFlagged(_account);

        emit ScoreUpdated(_account, 0, "SCORE_RESET", block.timestamp);
    }

    // ═══════════ Vues ═══════════

    function getReputation(address _account) external view returns (Reputation memory) {
        return _reputations[_account];
    }

    function getScore(address _account) external view returns (int256) {
        return _reputations[_account].score;
    }

    function isFlagged(address _account) external view returns (bool) {
        return _reputations[_account].flagged;
    }

    function getFlaggedAccounts() external view returns (address[] memory) {
        return _flaggedAccounts;
    }

    // ═══════════ Internal ═══════════

    function _checkFlag(address _account, Reputation storage _rep) internal {
        if (!_rep.flagged && _rep.score <= FLAG_THRESHOLD) {
            _rep.flagged = true;
            _flaggedAccounts.push(_account);
            emit AccountFlagged(_account, _rep.score, block.timestamp);
        }
    }

    function _removeFromFlagged(address _account) internal {
        for (uint256 i = 0; i < _flaggedAccounts.length; i++) {
            if (_flaggedAccounts[i] == _account) {
                _flaggedAccounts[i] = _flaggedAccounts[_flaggedAccounts.length - 1];
                _flaggedAccounts.pop();
                break;
            }
        }
    }
}
