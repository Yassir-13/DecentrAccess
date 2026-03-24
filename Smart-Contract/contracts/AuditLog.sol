// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DIDRegistry.sol";

/**
 * @title AuditLog
 * @notice Logs d'audit on-chain avec Merkle Tree pour DecentrAccess
 * @dev R10: Pagination pour getLogsBySigner/getLogsByType. Stocke les preuves (hashes) on-chain, données complètes sur IPFS
 */
contract AuditLog {

    DIDRegistry public didRegistry;

    struct LogEntry {
        bytes32 actionHash;
        string  actionType;       // "CREATE_USER", "LOGON_EVENT"...
        string  ipfsCID;          // Pointeur vers log complet sur IPFS
        address signer;
        bytes   signature;
        uint256 timestamp;
        uint256 blockNumber;
    }

    // State
    LogEntry[] private _logs;
    bytes32[]  private _leaves;
    bytes32    public  merkleRoot;

    mapping(address => uint256[]) private _logsBySigner;
    mapping(string  => uint256[]) private _logsByType;

    // Events
    event ActionLogged(
        uint256 indexed logIndex, 
        address indexed signer, 
        string  actionType, 
        bytes32 actionHash, 
        string  ipfsCID, 
        uint256 timestamp
    );
    event MerkleRootUpdated(bytes32 newRoot, uint256 leafCount);

    constructor(address _didRegistry) {
        didRegistry = DIDRegistry(_didRegistry);
    }

    /**
     * @notice Enregistre un log d'audit
     * @param _actionHash Hash des données de l'action
     * @param _actionType Type d'action
     * @param _ipfsCID CID IPFS du log complet
     * @param _signature Signature du signataire
     */
    function logAction(
        bytes32 _actionHash,
        string memory _actionType,
        string memory _ipfsCID,
        bytes memory _signature
    ) external {
        require(didRegistry.isDIDActive(msg.sender), "AuditLog: DID not active");

        uint256 logIndex = _logs.length;

        _logs.push(LogEntry({
            actionHash: _actionHash,
            actionType: _actionType,
            ipfsCID: _ipfsCID,
            signer: msg.sender,
            signature: _signature,
            timestamp: block.timestamp,
            blockNumber: block.number
        }));

        // Indexer par signataire et type
        _logsBySigner[msg.sender].push(logIndex);
        _logsByType[_actionType].push(logIndex);

        // Ajouter au Merkle Tree
        bytes32 leaf = keccak256(abi.encodePacked(
            _actionHash, msg.sender, _actionType, block.timestamp
        ));
        _leaves.push(leaf);
        _updateMerkleRoot();

        emit ActionLogged(logIndex, msg.sender, _actionType, _actionHash, _ipfsCID, block.timestamp);
    }

    // ═══════════ Lecture ═══════════

    function getLog(uint256 _index) external view returns (LogEntry memory) {
        require(_index < _logs.length, "AuditLog: index out of bounds");
        return _logs[_index];
    }

    function getLogCount() external view returns (uint256) {
        return _logs.length;
    }

    function getLogsBySigner(address _signer) external view returns (uint256[] memory) {
        return _logsBySigner[_signer];
    }

    function getLogsByType(string memory _actionType) external view returns (uint256[] memory) {
        return _logsByType[_actionType];
    }

    /**
     * @notice R10: Version paginée de getLogsBySigner
     * @param _signer Adresse du signataire
     * @param _offset Index de départ
     * @param _limit Nombre max de résultats
     */
    function getLogsBySignerPaginated(
        address _signer, 
        uint256 _offset, 
        uint256 _limit
    ) external view returns (uint256[] memory) {
        uint256[] storage indices = _logsBySigner[_signer];
        if (_offset >= indices.length) return new uint256[](0);

        uint256 end = _offset + _limit;
        if (end > indices.length) end = indices.length;
        uint256 size = end - _offset;

        uint256[] memory result = new uint256[](size);
        for (uint256 i = 0; i < size; i++) {
            result[i] = indices[_offset + i];
        }
        return result;
    }

    /**
     * @notice R10: Version paginée de getLogsByType
     */
    function getLogsByTypePaginated(
        string memory _actionType, 
        uint256 _offset, 
        uint256 _limit
    ) external view returns (uint256[] memory) {
        uint256[] storage indices = _logsByType[_actionType];
        if (_offset >= indices.length) return new uint256[](0);

        uint256 end = _offset + _limit;
        if (end > indices.length) end = indices.length;
        uint256 size = end - _offset;

        uint256[] memory result = new uint256[](size);
        for (uint256 i = 0; i < size; i++) {
            result[i] = indices[_offset + i];
        }
        return result;
    }

    /**
     * @notice R10: Nombre de logs par signataire (pour la pagination)
     */
    function getLogCountBySigner(address _signer) external view returns (uint256) {
        return _logsBySigner[_signer].length;
    }

    /**
     * @notice R10: Nombre de logs par type (pour la pagination)
     */
    function getLogCountByType(string memory _actionType) external view returns (uint256) {
        return _logsByType[_actionType].length;
    }

    function getLatestLogs(uint256 _count) external view returns (LogEntry[] memory) {
        uint256 total = _logs.length;
        if (_count > total) _count = total;
        
        LogEntry[] memory result = new LogEntry[](_count);
        for (uint256 i = 0; i < _count; i++) {
            result[i] = _logs[total - 1 - i];
        }
        return result;
    }

    // ═══════════ Merkle Tree ═══════════

    function getMerkleRoot() external view returns (bytes32) {
        return merkleRoot;
    }

    /**
     * @notice Génère la preuve Merkle pour un log donné
     * @param _logIndex Index du log
     * @return proof Tableau des nœuds frères pour la vérification
     */
    function getMerkleProof(uint256 _logIndex) external view returns (bytes32[] memory) {
        require(_logIndex < _leaves.length, "AuditLog: index out of bounds");

        uint256 n = _leaves.length;
        // Calculer la profondeur max
        uint256 depth = 0;
        uint256 temp = n;
        while (temp > 1) {
            temp = (temp + 1) / 2;
            depth++;
        }

        bytes32[] memory proof = new bytes32[](depth);
        uint256 proofIndex = 0;

        bytes32[] memory currentLevel = new bytes32[](n);
        for (uint256 i = 0; i < n; i++) {
            currentLevel[i] = _leaves[i];
        }

        uint256 index = _logIndex;

        while (currentLevel.length > 1) {
            uint256 nextLevelSize = (currentLevel.length + 1) / 2;
            bytes32[] memory nextLevel = new bytes32[](nextLevelSize);

            for (uint256 i = 0; i < currentLevel.length; i += 2) {
                if (i + 1 < currentLevel.length) {
                    nextLevel[i / 2] = _hashPair(currentLevel[i], currentLevel[i + 1]);
                } else {
                    nextLevel[i / 2] = currentLevel[i];
                }
            }

            // Ajouter le nœud frère à la preuve
            if (index % 2 == 0) {
                if (index + 1 < currentLevel.length) {
                    proof[proofIndex] = currentLevel[index + 1];
                    proofIndex++;
                }
            } else {
                proof[proofIndex] = currentLevel[index - 1];
                proofIndex++;
            }

            index = index / 2;
            currentLevel = nextLevel;
        }

        // Tronquer le tableau à la taille réelle
        bytes32[] memory trimmedProof = new bytes32[](proofIndex);
        for (uint256 i = 0; i < proofIndex; i++) {
            trimmedProof[i] = proof[i];
        }
        return trimmedProof;
    }

    /**
     * @notice Vérifie une preuve Merkle
     * @param _leaf La feuille à vérifier
     * @param _proof Les nœuds frères
     * @param _index L'index de la feuille
     * @return valid True si la preuve est valide
     */
    function verifyMerkleProof(
        bytes32 _leaf,
        bytes32[] memory _proof,
        uint256 _index
    ) external view returns (bool) {
        bytes32 computedHash = _leaf;
        uint256 currentIndex = _index;

        for (uint256 i = 0; i < _proof.length; i++) {
            if (currentIndex % 2 == 0) {
                computedHash = _hashPair(computedHash, _proof[i]);
            } else {
                computedHash = _hashPair(_proof[i], computedHash);
            }
            currentIndex = currentIndex / 2;
        }

        return computedHash == merkleRoot;
    }

    /**
     * @notice Reconstruit la feuille pour vérification
     */
    function computeLeaf(
        bytes32 _actionHash,
        address _signer,
        string memory _actionType,
        uint256 _timestamp
    ) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(_actionHash, _signer, _actionType, _timestamp));
    }

    // ═══════════ Internal ═══════════

    function _updateMerkleRoot() internal {
        uint256 n = _leaves.length;
        if (n == 0) {
            merkleRoot = bytes32(0);
            return;
        }
        if (n == 1) {
            merkleRoot = _leaves[0];
            emit MerkleRootUpdated(merkleRoot, n);
            return;
        }

        bytes32[] memory currentLevel = new bytes32[](n);
        for (uint256 i = 0; i < n; i++) {
            currentLevel[i] = _leaves[i];
        }

        while (currentLevel.length > 1) {
            uint256 nextLevelSize = (currentLevel.length + 1) / 2;
            bytes32[] memory nextLevel = new bytes32[](nextLevelSize);

            for (uint256 i = 0; i < currentLevel.length; i += 2) {
                if (i + 1 < currentLevel.length) {
                    nextLevel[i / 2] = _hashPair(currentLevel[i], currentLevel[i + 1]);
                } else {
                    nextLevel[i / 2] = currentLevel[i];
                }
            }
            currentLevel = nextLevel;
        }

        merkleRoot = currentLevel[0];
        emit MerkleRootUpdated(merkleRoot, n);
    }

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b 
            ? keccak256(abi.encodePacked(a, b)) 
            : keccak256(abi.encodePacked(b, a));
    }
}
