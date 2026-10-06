// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TipNovelVault - USDC tipping vault for open-reader authors on Arc
/// @notice Hackathon PoC: single vault maps authorId -> USDC balance (6 decimals).
/// Arc uses USDC for gas + ERC-20 transfers. We use ERC-20 path only for demo
/// to avoid native/ERC-20 decimal confusion (18 vs 6). AuthorId is
/// keccak256(normalized_author_name + source) computed off-chain.
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TipNovelVault is Ownable {
    IERC20 public immutable usdc;

    // authorId => total tipped (in USDC 6-decimals)
    mapping(bytes32 => uint256) public authorBalances;
    // authorId => unique tipper count
    mapping(bytes32 => uint256) public authorTipperCount;
    // authorId => tipper => seen
    mapping(bytes32 => mapping(address => bool)) public hasTipped;
    // authorId => whitelisted payout wallet (set after manual verification)
    mapping(bytes32 => address) public authorWallets;
    // authorId => verified flag
    mapping(bytes32 => bool) public verified;

    event Tipped(bytes32 indexed authorId, address indexed tipper, uint256 amount, string memo);
    event AuthorVerified(bytes32 indexed authorId, address indexed wallet);
    event Withdrawn(bytes32 indexed authorId, address indexed wallet, uint256 amount);

    constructor(address _usdc, address _owner) Ownable(_owner) {
        usdc = IERC20(_usdc);
    }

    /// @param authorId keccak256 of canonical author key
    function tip(bytes32 authorId, uint256 amount, string calldata memo) external {
        require(amount > 0, "amount=0");
        require(usdc.transferFrom(msg.sender, address(this), amount), "transfer failed");
        if (!hasTipped[authorId][msg.sender]) {
            hasTipped[authorId][msg.sender] = true;
            authorTipperCount[authorId] += 1;
        }
        authorBalances[authorId] += amount;
        emit Tipped(authorId, msg.sender, amount, memo);
    }

    /// @notice Admin verifies writer off-chain (ID + proof) then whitelists wallet.
    function verifyAuthor(bytes32 authorId, address wallet) external onlyOwner {
        require(wallet != address(0), "wallet=0");
        verified[authorId] = true;
        authorWallets[authorId] = wallet;
        emit AuthorVerified(authorId, wallet);
    }

    /// @notice Verified author withdraws accumulated tips.
    function withdraw(bytes32 authorId) external {
        require(verified[authorId], "not verified");
        require(authorWallets[authorId] == msg.sender, "not whitelisted");
        uint256 bal = authorBalances[authorId];
        require(bal > 0, "empty");
        authorBalances[authorId] = 0;
        require(usdc.transfer(msg.sender, bal), "payout failed");
        emit Withdrawn(authorId, msg.sender, bal);
    }

    function unclaimed(bytes32 authorId) external view returns (uint256) {
        return authorBalances[authorId];
    }
}
