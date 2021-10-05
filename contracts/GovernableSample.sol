// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// This contract is used exclusively for the test suite.
contract GovernableSample {

    uint public myValue;

    function updateMyValue(uint newValue) public {
        myValue = newValue;
    }
}