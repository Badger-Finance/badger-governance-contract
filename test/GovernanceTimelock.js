const { expect } = require("chai");
const { ethers } = require("hardhat");

const DELAY = 3 * 86400;

describe("Governance Timelock contract", function () {
    before(async function () {
        this.GovernanceTimelock = await ethers.getContractFactory('GovernanceTimelock');
        this.GovernableSample = await ethers.getContractFactory('GovernableSample');
    });

    beforeEach(async function () {
        const [admin, proposer, executor, guardian1, guardian2] = await ethers.getSigners();
        this.governanceTimelock = await this.GovernanceTimelock.deploy(admin.address, DELAY);
        await this.governanceTimelock.deployed();

        await this.governanceTimelock.grantRole(ethers.utils.keccak256(ethers.utils.toUtf8Bytes("PROPOSER")), proposer.address);
        await this.governanceTimelock.grantRole(ethers.utils.keccak256(ethers.utils.toUtf8Bytes("EXECUTOR")), executor.address);
        await this.governanceTimelock.grantRole(ethers.utils.keccak256(ethers.utils.toUtf8Bytes("GUARDIAN")), guardian1.address);
        await this.governanceTimelock.grantRole(ethers.utils.keccak256(ethers.utils.toUtf8Bytes("GUARDIAN")), guardian2.address);

        this.governableSample = await this.GovernableSample.deploy();
        await this.governableSample.deployed();
    });

    it("should allow appropriate roles to queue and execute", async function () {
        const [admin, proposer, executor, guardian1, guardian2, normie] = await ethers.getSigners();
        const currentBlock = await ethers.provider.getBlock()

        const PARAMS = [
            this.governableSample.address,
            0,
            "updateMyValue(uint256)",
            ethers.utils.defaultAbiCoder.encode(["uint256"], [100]),
            currentBlock.timestamp + DELAY + 100
        ]

        expect(await this.governableSample.myValue()).to.eq("0");

        // Only proposers can queue
        await expect(this.governanceTimelock.connect(admin).queueTransaction(...PARAMS)).to.be.reverted;
        await expect(this.governanceTimelock.connect(executor).queueTransaction(...PARAMS)).to.be.reverted;
        await expect(this.governanceTimelock.connect(guardian1).queueTransaction(...PARAMS)).to.be.reverted;
        await expect(this.governanceTimelock.connect(normie).queueTransaction(...PARAMS)).to.be.reverted;
        await this.governanceTimelock.connect(proposer).queueTransaction(...PARAMS)

        // No one can execute because of timelock
        await expect(this.governanceTimelock.connect(admin).executeTransaction(...PARAMS)).to.be.reverted;
        await expect(this.governanceTimelock.connect(executor).executeTransaction(...PARAMS)).to.be.reverted;
        await expect(this.governanceTimelock.connect(guardian2).executeTransaction(...PARAMS)).to.be.reverted;
        await expect(this.governanceTimelock.connect(proposer).executeTransaction(...PARAMS)).to.be.reverted;
        await expect(this.governanceTimelock.connect(normie).executeTransaction(...PARAMS)).to.be.reverted;

        // Advance time
        await ethers.provider.send("evm_setNextBlockTimestamp", [currentBlock.timestamp + DELAY + 100]);
        await ethers.provider.send("evm_mine");

        // Only executors can execute
        await expect(this.governanceTimelock.connect(admin).executeTransaction(...PARAMS)).to.be.reverted;
        await expect(this.governanceTimelock.connect(guardian2).executeTransaction(...PARAMS)).to.be.reverted;
        await expect(this.governanceTimelock.connect(proposer).executeTransaction(...PARAMS)).to.be.reverted;
        await expect(this.governanceTimelock.connect(normie).executeTransaction(...PARAMS)).to.be.reverted;
        await this.governanceTimelock.connect(executor).executeTransaction(...PARAMS);

        expect(await this.governableSample.myValue()).to.eq("100");
    });

    it("should allow only guardians and admins to cancel", async function () {
        const [admin, proposer, executor, guardian1, guardian2, normie] = await ethers.getSigners();
        const currentBlock = await ethers.provider.getBlock()

        const PARAMS = [
            this.governableSample.address,
            0,
            "updateMyValue(uint256)",
            ethers.utils.defaultAbiCoder.encode(["uint256"], [100]),
            currentBlock.timestamp + DELAY + 100
        ]

        await this.governanceTimelock.connect(proposer).queueTransaction(...PARAMS)

        // Only guardians can cancel
        await expect(this.governanceTimelock.connect(executor).cancelTransaction(...PARAMS)).to.be.reverted;
        await expect(this.governanceTimelock.connect(proposer).cancelTransaction(...PARAMS)).to.be.reverted;
        await expect(this.governanceTimelock.connect(normie).cancelTransaction(...PARAMS)).to.be.reverted;
        await this.governanceTimelock.connect(guardian1).cancelTransaction(...PARAMS)

        // And admins
        await this.governanceTimelock.connect(proposer).queueTransaction(...PARAMS)
        await this.governanceTimelock.connect(admin).cancelTransaction(...PARAMS)
    });

    it("should allow revoking guardian roles through the timelock, uncancellable by guardians", async function () {
        const [admin, proposer, executor, guardian1, guardian2, normie] = await ethers.getSigners();
        const currentBlock = await ethers.provider.getBlock()

        // Check that guardian1 is a guardian
        expect(await this.governanceTimelock.hasRole(ethers.utils.keccak256(ethers.utils.toUtf8Bytes("GUARDIAN")), guardian1.address)).to.eq(true);

        const PARAMS = [
            this.governanceTimelock.address,
            0,
            "revokeRole(bytes32,address)",
            ethers.utils.defaultAbiCoder.encode(["bytes32", "address"], [ethers.utils.keccak256(ethers.utils.toUtf8Bytes("GUARDIAN")), guardian1.address]),
            currentBlock.timestamp + DELAY + 100
        ]
        await this.governanceTimelock.connect(proposer).queueTransaction(...PARAMS);

        // Guardians can't cancel
        await expect(this.governanceTimelock.connect(guardian1).cancelTransaction(...PARAMS)).to.be.reverted;
        await expect(this.governanceTimelock.connect(guardian2).cancelTransaction(...PARAMS)).to.be.reverted;

        // Advance time
        await ethers.provider.send("evm_setNextBlockTimestamp", [currentBlock.timestamp + DELAY + 100]);
        await ethers.provider.send("evm_mine");

        await this.governanceTimelock.connect(executor).executeTransaction(...PARAMS);

        // Check that guardian1 is no longer a guardian
        expect(await this.governanceTimelock.hasRole(ethers.utils.keccak256(ethers.utils.toUtf8Bytes("GUARDIAN")), guardian1.address)).to.eq(false);

    });

});