const { ethers } = require("ethers");

// connexion RPC à geth
const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

// wallet qui signe les transactions
const wallet = new ethers.Wallet("0xb71c71a67e1177ad4e901695e1b4b9ee17ae16c6668d313eac2f96dbcda3f291", provider);

// ABI minimal du contrat HelloWorld
const abi = [
  "function message() view returns (string)",
  "function setMessage(string newMessage)"
];

// adresse du contrat déployé
const contractAddress = "0x3A220f351252089D385b29beca14e27F204c296A";

// connexion au contrat
const contract = new ethers.Contract(contractAddress, abi, wallet);

async function test() {

  // lire le message actuel
  const msg = await contract.message();
  console.log("Current message:", msg);

  // écrire un nouveau message
  const tx = await contract.setMessage("Hello DecentrAccess from Node.js");

  await tx.wait();

  console.log("Transaction confirmed");

  const newMsg = await contract.message();
  console.log("New message:", newMsg);

}

test();