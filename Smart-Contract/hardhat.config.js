require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    geth: {
      url: "http://127.0.0.1:8545",
      chainId: 1337,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY]
    }
  }
};