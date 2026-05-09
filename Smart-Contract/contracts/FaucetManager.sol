// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DIDRegistry.sol";
import "./AccessControl.sol";

/**
 * @title FaucetManager
 * @notice Distribution d'ETH aux wallets enregistrés pour le gas
 * @dev Utilisé pour le financement initial et le dépannage (wallet à sec)
 *      Seul le SUPER_ADMIN peut distribuer. Seuls les DIDs actifs peuvent recevoir.
 */
contract FaucetManager {

    DIDRegistry   public didRegistry;
    AccessControl public accessControl;

    // Montant par défaut distribué par le faucet
    uint256 public defaultAmount = 0.5 ether;

    // Historique : adresse → dernier timestamp de distribution
    mapping(address => uint256) public lastFunded;

    // Cooldown entre deux distributions vers le même wallet (24h par défaut)
    uint256 public cooldown = 24 hours;

    // Events
    event Funded(address indexed recipient, uint256 amount, address indexed by, uint256 timestamp);
    event DefaultAmountUpdated(uint256 oldAmount, uint256 newAmount);
    event CooldownUpdated(uint256 oldCooldown, uint256 newCooldown);
    event Deposited(address indexed from, uint256 amount);

    modifier onlySuperAdmin() {
        require(
            accessControl.hasRole(msg.sender, accessControl.SUPER_ADMIN()),
            "FaucetManager: only SUPER_ADMIN"
        );
        _;
    }

    modifier onlyActiveDID(address _recipient) {
        require(
            didRegistry.isDIDActive(_recipient),
            "FaucetManager: recipient DID not active"
        );
        _;
    }

    /**
     * @notice Déploiement — peut recevoir de l'ETH immédiatement via le constructeur
     */
    constructor(address _didRegistry, address _accessControl) payable {
        didRegistry   = DIDRegistry(_didRegistry);
        accessControl = AccessControl(_accessControl);
    }

    /**
     * @notice Distribue le montant par défaut à un wallet
     * @dev Le recipient doit avoir un DID actif. Cooldown appliqué.
     * @param _recipient Adresse du wallet à financer
     */
    function fund(address payable _recipient)
        external
        onlySuperAdmin
        onlyActiveDID(_recipient)
    {
        _fund(_recipient, defaultAmount);
    }

    /**
     * @notice Distribue un montant personnalisé à un wallet
     * @dev Pour les cas de dépannage où le montant par défaut ne suffit pas
     * @param _recipient Adresse du wallet à financer
     * @param _amount Montant en wei à envoyer
     */
    function fundAmount(address payable _recipient, uint256 _amount)
        external
        onlySuperAdmin
        onlyActiveDID(_recipient)
    {
        require(_amount > 0, "FaucetManager: amount must be > 0");
        _fund(_recipient, _amount);
    }

    /**
     * @notice Distribue à plusieurs wallets en une seule transaction
     * @dev Pratique après l'enregistrement d'un lot de DIDs
     * @param _recipients Liste des adresses à financer
     */
    function fundBatch(address payable[] calldata _recipients)
        external
        onlySuperAdmin
    {
        require(_recipients.length > 0, "FaucetManager: empty list");
        require(
            address(this).balance >= defaultAmount * _recipients.length,
            "FaucetManager: insufficient balance for batch"
        );

        for (uint i = 0; i < _recipients.length; i++) {
            if (!didRegistry.isDIDActive(_recipients[i])) continue; // Skip les DIDs inactifs
            if (_recipients[i] == address(0)) continue;             // Skip les adresses nulles
            _fund(_recipients[i], defaultAmount);
        }
    }

    /**
     * @notice Modifie le montant par défaut
     */
    function setDefaultAmount(uint256 _newAmount) external onlySuperAdmin {
        require(_newAmount > 0, "FaucetManager: amount must be > 0");
        emit DefaultAmountUpdated(defaultAmount, _newAmount);
        defaultAmount = _newAmount;
    }

    /**
     * @notice Modifie le cooldown entre deux distributions vers le même wallet
     * @param _newCooldown En secondes (0 = pas de cooldown)
     */
    function setCooldown(uint256 _newCooldown) external onlySuperAdmin {
        emit CooldownUpdated(cooldown, _newCooldown);
        cooldown = _newCooldown;
    }

    /**
     * @notice Balance actuelle du faucet
     */
    function balance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Vérifie si un wallet peut être financé maintenant
     * @param _recipient Adresse à vérifier
     */
    function canFund(address _recipient) external view returns (bool, string memory) {
        if (!didRegistry.isDIDActive(_recipient)) {
            return (false, "DID not active");
        }
        if (address(this).balance < defaultAmount) {
            return (false, "Insufficient faucet balance");
        }
        if (cooldown > 0 && block.timestamp < lastFunded[_recipient] + cooldown) {
            return (false, "Cooldown not elapsed");
        }
        return (true, "OK");
    }

    /**
     * @notice Permet de déposer de l'ETH dans le faucet
     */
    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    // ═══════════ Internal ═══════════

    function _fund(address payable _recipient, uint256 _amount) internal {
        require(address(this).balance >= _amount, "FaucetManager: insufficient balance");

        // Cooldown check (sauf si cooldown = 0)
        if (cooldown > 0) {
            require(
                block.timestamp >= lastFunded[_recipient] + cooldown,
                "FaucetManager: cooldown not elapsed"
            );
        }

        lastFunded[_recipient] = block.timestamp;

        (bool success, ) = _recipient.call{value: _amount}("");
        require(success, "FaucetManager: transfer failed");

        emit Funded(_recipient, _amount, msg.sender, block.timestamp);
    }
}
