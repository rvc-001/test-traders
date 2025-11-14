async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const Turbo = await ethers.getContractFactory("TurboRacers");
  const turbo = await Turbo.deploy();
  await turbo.deployed();
  console.log("TurboRacers deployed to:", turbo.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
