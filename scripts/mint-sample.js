// scripts/mint-sample.js
/**
 * Sample script to mint a few racers (run after deploy)
 * Usage: npx hardhat run scripts/mint-sample.js --network <network>
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const Turbo = await ethers.getContractFactory("TurboRacers");
  const turbo = Turbo.attach(process.env.CONTRACT_ADDRESS);
  console.log("Connected to", turbo.address);

  const racers = [
    ["Speedster", 200, 120, 180, ethers.utils.parseEther("1")],
    ["Thunder", 185, 140, 170, ethers.utils.parseEther("1")],
    ["Blaze", 195, 130, 160, ethers.utils.parseEther("1")]
  ];

  for (const r of racers) {
    const tx = await turbo.mintRacer(r[0], r[1], r[2], r[3], r[4]);
    await tx.wait();
    console.log("Minted", r[0]);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
