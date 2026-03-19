async function main() {
  const ShadowRegistry = await ethers.getContractFactory('ShadowRegistry');
  const contract = await ShadowRegistry.deploy();
  await contract.waitForDeployment();
  console.log('ShadowRegistry deployed to:', await contract.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});