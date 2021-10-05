## Notes
* I'm unsure of the upgrade path for the current timelock contract. Because the existing contract variables have been altered here, this implementation can't be used via a standard upgradeability proxy as written.
* This implementation uses `AccessControlEnumerable` (rather than `AccessControl`) because there is use for enumerability in the spec for the portal.
* The mechanism to prevent guardians from cancelling guardian role revocation, in short, consists of storing the transaction hash when it's queued and checking for a match in the cancellation function.
* Note that guardians can still call `renounceRole` directly.
* To allow the timelock to execute changes to access control, the contract grants itself admin permission in the constructor. The `revokeRole()` and `renounceRole()` methods have been overridden to ensure this permission cannot be removed.
* The spec mentions that there is only intended to be a single admin. This is not currently enforced in this implementation, but it could be added with an override to the `grantRole()` method.