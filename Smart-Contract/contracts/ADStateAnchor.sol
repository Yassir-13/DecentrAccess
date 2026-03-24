// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DIDRegistry.sol";
import "./AccessControl.sol";

/**
 * @title ADStateAnchor
 * @notice Ancrage périodique de l'état Active Directory on-chain
 * @dev Les agents soumettent des snapshots de l'AD. Permet de détecter les modifications
 *      hors-dApp (drift detection).
 */
contract ADStateAnchor {

    DIDRegistry   public didRegistry;
    AccessControl public accessControl;

    struct StateSnapshot {
        bytes32 stateHash;          // Hash SHA256 de l'état AD complet
        string  ipfsCID;            // État complet stocké sur IPFS
        uint256 userCount;
        uint256 groupCount;
        uint256 computerCount;
        address submittedBy;        // Agent qui a soumis
        uint256 timestamp;
        uint256 blockNumber;
    }

    // State
    StateSnapshot[] private _snapshots;
    bool public driftDetected;
    bytes32 public lastKnownStateHash;

    // Events
    event StateAnchored(uint256 indexed snapshotId, bytes32 stateHash, uint256 userCount, uint256 groupCount, uint256 computerCount, address submittedBy, uint256 timestamp);
    event DriftDetected(uint256 indexed snapshotId, bytes32 expectedHash, bytes32 actualHash, address detectedBy, uint256 timestamp);
    event DriftResolved(address resolvedBy, uint256 timestamp);

    constructor(address _didRegistry, address _accessControl) {
        didRegistry   = DIDRegistry(_didRegistry);
        accessControl = AccessControl(_accessControl);
    }

    /**
     * @notice Ancre un snapshot de l'état AD
     * @dev Appelé par un agent (cron toutes les X heures)
     */
    function anchorState(
        bytes32 _stateHash,
        string memory _ipfsCID,
        uint256 _userCount,
        uint256 _groupCount,
        uint256 _computerCount
    ) external {
        require(didRegistry.isDIDActive(msg.sender), "ADStateAnchor: DID not active");

        uint256 snapshotId = _snapshots.length;

        _snapshots.push(StateSnapshot({
            stateHash: _stateHash,
            ipfsCID: _ipfsCID,
            userCount: _userCount,
            groupCount: _groupCount,
            computerCount: _computerCount,
            submittedBy: msg.sender,
            timestamp: block.timestamp,
            blockNumber: block.number
        }));

        // Détection de drift : comparer avec le dernier hash connu
        if (lastKnownStateHash != bytes32(0) && _stateHash != lastKnownStateHash) {
            driftDetected = true;
            emit DriftDetected(snapshotId, lastKnownStateHash, _stateHash, msg.sender, block.timestamp);
        }

        lastKnownStateHash = _stateHash;

        emit StateAnchored(snapshotId, _stateHash, _userCount, _groupCount, _computerCount, msg.sender, block.timestamp);
    }

    /**
     * @notice Résout le drift après investigation (SUPER_ADMIN uniquement)
     */
    function resolveDrift() external {
        require(
            accessControl.hasRole(msg.sender, accessControl.SUPER_ADMIN()),
            "ADStateAnchor: only SUPER_ADMIN"
        );
        require(driftDetected, "ADStateAnchor: no drift detected");

        driftDetected = false;
        emit DriftResolved(msg.sender, block.timestamp);
    }

    /**
     * @notice Vérifie si un hash correspond au dernier état connu
     */
    function verifyState(bytes32 _stateHash) external view returns (bool) {
        return lastKnownStateHash == _stateHash;
    }

    // ═══════════ Vues ═══════════

    function getLatestSnapshot() external view returns (StateSnapshot memory) {
        require(_snapshots.length > 0, "ADStateAnchor: no snapshots");
        return _snapshots[_snapshots.length - 1];
    }

    function getSnapshot(uint256 _index) external view returns (StateSnapshot memory) {
        require(_index < _snapshots.length, "ADStateAnchor: invalid index");
        return _snapshots[_index];
    }

    function getSnapshotCount() external view returns (uint256) {
        return _snapshots.length;
    }

    /**
     * @notice Retourne l'historique des N derniers snapshots
     */
    function getLatestSnapshots(uint256 _count) external view returns (StateSnapshot[] memory) {
        uint256 total = _snapshots.length;
        if (_count > total) _count = total;

        StateSnapshot[] memory result = new StateSnapshot[](_count);
        for (uint256 i = 0; i < _count; i++) {
            result[i] = _snapshots[total - 1 - i];
        }
        return result;
    }

    /**
     * @notice Compare deux snapshots pour voir les changements
     */
    function compareSnapshots(uint256 _idA, uint256 _idB) external view returns (
        int256 userDiff,
        int256 groupDiff,
        int256 computerDiff,
        bool hashChanged
    ) {
        require(_idA < _snapshots.length && _idB < _snapshots.length, "ADStateAnchor: invalid index");

        StateSnapshot storage a = _snapshots[_idA];
        StateSnapshot storage b = _snapshots[_idB];

        userDiff = int256(b.userCount) - int256(a.userCount);
        groupDiff = int256(b.groupCount) - int256(a.groupCount);
        computerDiff = int256(b.computerCount) - int256(a.computerCount);
        hashChanged = a.stateHash != b.stateHash;
    }
}
