// scripts/set-updater.js
//
// Usage:
//   SERVER_ADDRESS=0xYourServerAddress \
//   CONTRACT_ADDRESS=0xYourContractAddress \
//   npx hardhat run --network localhost scripts/set-updater.js
//
// Make sure your .env has the PRIVATE_KEY for the owner account
// (the one that deployed the contract), or run with an owner signer via Hardhat console.
//

require("dotenv").config();

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const serverAddress = process.env.SERVER_ADDRESS;

  if (!contractAddress) throw new Error("Missing CONTRACT_ADDRESS env var");
  if (!serverAddress) throw new Error("Missing SERVER_ADDRESS env var");

  console.log("Using contract:", contractAddress);
  console.log("Setting priceUpdater =", serverAddress);

  // Get contract instance
  const Turbo = await ethers.getContractFactory("TurboRacers");
  const turbo = Turbo.attach(contractAddress);

  // Call setPriceUpdater as the owner
  const tx = await turbo.setPriceUpdater(serverAddress);
  console.log("Transaction sent:", tx.hash);

  await tx.wait();
  console.log("✔ priceUpdater updated successfully!");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
