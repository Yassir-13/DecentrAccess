// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DIDRegistry
 * @notice Registre décentralisé des identités (DIDs) pour DecentrAccess
 * @dev Gère les DIDs des admins, machines et services
 */
contract DIDRegistry {

    enum EntityType { Admin, Machine, Service }

    struct DIDDocument {
        address owner;
        string  did;             // "did:da:0xABC..."
        EntityType entityType;
        bytes32 publicKeyHash;
        string  metadata;        // JSON (nom, hostname, département...)
        uint256 createdAt;
        uint256 updatedAt;
        bool    active;
    }

    // Mappings
    mapping(address => DIDDocument) private _dids;
    mapping(uint8 => address[]) private _didsByType;
    
    uint256 public totalDIDs;

    // Events
    event DIDRegistered(address indexed owner, string did, EntityType entityType, bytes32 publicKeyHash, string metadata, uint256 timestamp);
    event DIDUpdated(address indexed owner, string field, uint256 timestamp);
    event DIDDeactivated(address indexed owner, uint256 timestamp);
    event DIDReactivated(address indexed owner, uint256 timestamp);

    // Modifiers
    modifier onlyActiveDID(address account) {
        require(_dids[account].active, "DIDRegistry: DID not active");
        _;
    }

    modifier onlyDIDOwner(address account) {
        require(_dids[account].owner == msg.sender || msg.sender == account, "DIDRegistry: not owner");
        _;
    }

    modifier didExists(address account) {
        require(_dids[account].createdAt != 0, "DIDRegistry: DID does not exist");
        _;
    }

    modifier didNotExists(address account) {
        require(_dids[account].createdAt == 0, "DIDRegistry: DID already exists");
        _;
    }

    /**
     * @notice Enregistre un nouveau DID
     * @param _did L'identifiant DID (ex: "did:da:0xABC...")
     * @param _entityType Type d'entité (Admin, Machine, Service)
     * @param _publicKeyHash Hash de la clé publique
     * @param _metadata Métadonnées JSON
     */
    function registerDID(
        string memory _did,
        EntityType _entityType,
        bytes32 _publicKeyHash,
        string memory _metadata
    ) external didNotExists(msg.sender) {
        _dids[msg.sender] = DIDDocument({
            owner: msg.sender,
            did: _did,
            entityType: _entityType,
            publicKeyHash: _publicKeyHash,
            metadata: _metadata,
            createdAt: block.timestamp,
            updatedAt: block.timestamp,
            active: true
        });

        _didsByType[uint8(_entityType)].push(msg.sender);
        totalDIDs++;

        emit DIDRegistered(msg.sender, _did, _entityType, _publicKeyHash, _metadata, block.timestamp);
    }

    /**
     * @notice Résout un DID par adresse
     */
    function resolveDID(address _owner) external view didExists(_owner) returns (DIDDocument memory) {
        return _dids[_owner];
    }

    /**
     * @notice Met à jour la clé publique
     */
    function updatePublicKey(bytes32 _newKeyHash) external didExists(msg.sender) onlyActiveDID(msg.sender) {
        _dids[msg.sender].publicKeyHash = _newKeyHash;
        _dids[msg.sender].updatedAt = block.timestamp;
        emit DIDUpdated(msg.sender, "publicKey", block.timestamp);
    }

    /**
     * @notice Met à jour les métadonnées
     */
    function updateMetadata(string memory _newMetadata) external didExists(msg.sender) onlyActiveDID(msg.sender) {
        _dids[msg.sender].metadata = _newMetadata;
        _dids[msg.sender].updatedAt = block.timestamp;
        emit DIDUpdated(msg.sender, "metadata", block.timestamp);
    }

    /**
     * @notice Désactive un DID (ne le supprime jamais)
     */
    function deactivateDID(address _owner) external didExists(_owner) onlyDIDOwner(_owner) {
        require(_dids[_owner].active, "DIDRegistry: already inactive");
        _dids[_owner].active = false;
        _dids[_owner].updatedAt = block.timestamp;
        emit DIDDeactivated(_owner, block.timestamp);
    }

    /**
     * @notice Réactive un DID
     */
    function reactivateDID(address _owner) external didExists(_owner) onlyDIDOwner(_owner) {
        require(!_dids[_owner].active, "DIDRegistry: already active");
        _dids[_owner].active = true;
        _dids[_owner].updatedAt = block.timestamp;
        emit DIDReactivated(_owner, block.timestamp);
    }

    /**
     * @notice Vérifie si un DID est actif
     */
    function isDIDActive(address _owner) external view returns (bool) {
        return _dids[_owner].active && _dids[_owner].createdAt != 0;
    }

    /**
     * @notice Vérifie si un DID existe
     */
    function didExistsCheck(address _owner) external view returns (bool) {
        return _dids[_owner].createdAt != 0;
    }

    /**
     * @notice Retourne les adresses par type d'entité
     */
    function getDIDsByType(EntityType _entityType) external view returns (address[] memory) {
        return _didsByType[uint8(_entityType)];
    }
}
