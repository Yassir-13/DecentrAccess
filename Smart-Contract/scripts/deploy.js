const { ethers } = require("hardhat");

async function main() {

  console.log("Deploying contract...");

  const HelloWorld = await ethers.getContractFactory("HelloWorld");

  const contract = await HelloWorld.deploy();

  await contract.deployed();

  console.log("Contract deployed at:", contract.address);

}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
});