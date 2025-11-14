// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract TurboRacers is Ownable {
    struct Racer {
        uint256 id;
        string name;
        uint8 speed;        // 0-255 (game stat)
        uint8 aggression;   // 0-255 (game stat)
        uint8 consistency;  // 0-255 (game stat)
        uint256 currentPrice; // price in wei (use 18 decimals)
        bool exists;
    }

    uint256 public nextId;
    mapping(uint256 => Racer) private racers;
    uint256[] private racerIds;

    // role that can update prices (owner by default)
    address public priceUpdater;

    event RacerMinted(uint256 indexed id, string name, uint256 price);
    event PriceUpdated(uint256 indexed id, uint256 oldPrice, uint256 newPrice, address indexed by);
    event PriceUpdaterChanged(address indexed previousUpdater, address indexed newUpdater);

    modifier onlyUpdater() {
        require(msg.sender == owner() || msg.sender == priceUpdater, "Not authorized");
        _;
    }

    // NOTE: pass initial owner to OpenZeppelin's Ownable base constructor
    // so that Ownable sets the owner to the deploying address.
    constructor() Ownable(msg.sender) {
        nextId = 1;
        priceUpdater = owner();
    }

    function setPriceUpdater(address _updater) external onlyOwner {
        address prev = priceUpdater;
        priceUpdater = _updater;
        emit PriceUpdaterChanged(prev, _updater);
    }

    // Mint a racer (owner action). Prices passed as wei (use ethers.utils.parseEther on client).
    function mintRacer(
        string memory _name,
        uint8 _speed,
        uint8 _aggression,
        uint8 _consistency,
        uint256 _initialPrice
    ) external onlyOwner {
        uint256 id = nextId++;
        racers[id] = Racer({
            id: id,
            name: _name,
            speed: _speed,
            aggression: _aggression,
            consistency: _consistency,
            currentPrice: _initialPrice,
            exists: true
        });
        racerIds.push(id);
        emit RacerMinted(id, _name, _initialPrice);
    }

    // View single racer
    function getRacer(uint256 id) external view returns (
        uint256, string memory, uint8, uint8, uint8, uint256
    ) {
        require(racers[id].exists, "No racer");
        Racer storage r = racers[id];
        return (r.id, r.name, r.speed, r.aggression, r.consistency, r.currentPrice);
    }

    // Get all IDs (client can iterate)
    function getAllRacerIds() external view returns (uint256[] memory) {
        return racerIds;
    }

    // Update price (only owner or priceUpdater)
    function updatePrice(uint256 id, uint256 newPrice) external onlyUpdater {
        require(racers[id].exists, "No racer");
        uint256 old = racers[id].currentPrice;
        racers[id].currentPrice = newPrice;
        emit PriceUpdated(id, old, newPrice, msg.sender);
    }

    // Convenience: return racer count
    function racerCount() external view returns (uint256) {
        return racerIds.length;
    }
}
