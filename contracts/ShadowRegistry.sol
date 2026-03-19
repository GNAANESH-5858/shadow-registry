// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ShadowRegistry {
    event CertificateAnchored(address indexed submitter, bytes32 hash, uint256 timestamp);

    function anchorCertificate(bytes32 hash) external {
        emit CertificateAnchored(msg.sender, hash, block.timestamp);
    }
}

