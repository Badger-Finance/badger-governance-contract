// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";

contract GovernanceTimelock is AccessControlEnumerable {

    event NewDelay(uint256 indexed newDelay);
    event CancelTransaction(bytes32 indexed txHash, address indexed target, uint256 value, string signature, bytes data, uint256 eta);
    event ExecuteTransaction(bytes32 indexed txHash, address indexed target, uint256 value, string signature, bytes data, uint256 eta);
    event QueueTransaction(bytes32 indexed txHash, address indexed target, uint256 value, string signature, bytes data, uint256 eta);

    uint256 public constant GRACE_PERIOD = 14 days;
    uint256 public constant MINIMUM_DELAY = 2 days;
    uint256 public constant MAXIMUM_DELAY = 30 days;

    bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN");

    uint256 public delay;

    mapping(bytes32 => bool) public queuedTransactions;
    mapping(bytes32 => bool) public queuedGuardianRemovalTransactions;

    constructor(
        address admin_,
        uint256 delay_
    ) public {
        require(delay_ >= MINIMUM_DELAY, "Timelock::constructor: Delay must exceed minimum delay.");
        require(delay_ <= MAXIMUM_DELAY, "Timelock::constructor: Delay must not exceed maximum delay.");
        require(admin_ != address(0));

        _setupRole(DEFAULT_ADMIN_ROLE, admin_);
        _setupRole(DEFAULT_ADMIN_ROLE, address(this));
        delay = delay_;
    }

    fallback() external payable {}

    receive() external payable {}

    function setDelay(uint256 delay_) public {
        require(msg.sender == address(this), "Timelock::setDelay: Call must come from Timelock.");
        require(delay_ >= MINIMUM_DELAY, "Timelock::setDelay: Delay must exceed minimum delay.");
        require(delay_ <= MAXIMUM_DELAY, "Timelock::setDelay: Delay must not exceed maximum delay.");
        delay = delay_;

        emit NewDelay(delay);
    }

    function queueTransaction(
        address target,
        uint256 value,
        string memory signature,
        bytes memory data,
        uint256 eta
    ) public returns (bytes32) {
        require(hasRole(PROPOSER_ROLE, msg.sender), "Timelock::queueTransaction: Call must come from proposers.");
        require(eta >= getBlockTimestamp() + delay, "Timelock::queueTransaction: Estimated execution block must satisfy delay.");

        bytes32 txHash = keccak256(abi.encode(target, value, signature, data, eta));
        queuedTransactions[txHash] = true;

        // Store hash if queued transaction is revoking a guardian's role
        if(keccak256(bytes(signature)) == keccak256(bytes("revokeRole(bytes32,address)" ))){
            (bytes32 role,) = abi.decode(data, (bytes32, address));
            queuedGuardianRemovalTransactions[txHash] =
                target == address(this) &&
                role == GUARDIAN_ROLE;
        }

        emit QueueTransaction(txHash, target, value, signature, data, eta);
        return txHash;
    }
    

    function cancelTransaction(
        address target,
        uint256 value,
        string memory signature,
        bytes memory data,
        uint256 eta
    ) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender) || hasRole(GUARDIAN_ROLE, msg.sender), "Timelock::cancelTransaction: Call must come from admin or guardians.");
        
        bytes32 txHash = keccak256(abi.encode(target, value, signature, data, eta));
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender) || !queuedGuardianRemovalTransactions[txHash],  "Timelock::cancelTransaction: Call to cancel revoking a guardian must come from an admin.");
        queuedTransactions[txHash] = false;
        queuedGuardianRemovalTransactions[txHash] = false;

        emit CancelTransaction(txHash, target, value, signature, data, eta);
    }

    function executeTransaction(
        address target,
        uint256 value,
        string memory signature,
        bytes memory data,
        uint256 eta
    ) public payable returns (bytes memory) {
        require(hasRole(EXECUTOR_ROLE, msg.sender), "Timelock::executeTransaction: Call must come from executors.");

        bytes32 txHash = keccak256(abi.encode(target, value, signature, data, eta));
        require(queuedTransactions[txHash], "Timelock::executeTransaction: Transaction hasn't been queued.");
        require(getBlockTimestamp() >= eta, "Timelock::executeTransaction: Transaction hasn't surpassed time lock.");
        require(getBlockTimestamp() <= eta + GRACE_PERIOD, "Timelock::executeTransaction: Transaction is stale.");

        queuedTransactions[txHash] = false;

        bytes memory callData;

        if (bytes(signature).length == 0) {
            callData = data;
        } else {
            callData = abi.encodePacked(bytes4(keccak256(bytes(signature))), data);
        }

        // solium-disable-next-line security/no-call-value
        (bool success, bytes memory returnData) = target.call{value: value}(callData);
        require(success, "Timelock::executeTransaction: Transaction execution reverted.");

        emit ExecuteTransaction(txHash, target, value, signature, data, eta);

        return returnData;
    }

    function getBlockTimestamp() internal view returns (uint256) {
        // solium-disable-next-line security/no-block-members
        return block.timestamp;
    }

    function renounceRole(bytes32 role, address account) public virtual override {
        require(account != address(this), 'The timelock must retain its admin role.');
        super.renounceRole(role, account);
    }

    function revokeRole(bytes32 role, address account) public virtual override onlyRole(getRoleAdmin(role)) {
        require(account != address(this), 'The timelock must retain its admin role.');
        super.revokeRole(role, account);
    }
}