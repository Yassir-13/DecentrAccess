const { ethers } = require("hardhat");

async function main() {

  const address = "0x61940e28ef88f8f743A47D511C892EF1c46c6993";

  const contract = await ethers.getContractAt("HelloWorld", address);

  const message = await contract.message();

  console.log("Current message:", message);

}

main();