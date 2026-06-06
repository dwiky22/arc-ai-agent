// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

contract SimpleAMM {
    IERC20 public tokenA; // USDC
    IERC20 public tokenB; // EURC
    
    uint256 public reserveA;
    uint256 public reserveB;
    uint256 public constant FEE = 3; // 0.3%
    
    address public owner;
    
    event Swap(address indexed user, address tokenIn, uint256 amountIn, uint256 amountOut);
    event LiquidityAdded(address indexed provider, uint256 amountA, uint256 amountB);

    constructor(address _tokenA, address _tokenB) {
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
        owner = msg.sender;
    }

    function addLiquidity(uint256 amountA, uint256 amountB) external {
        tokenA.transferFrom(msg.sender, address(this), amountA);
        tokenB.transferFrom(msg.sender, address(this), amountB);
        reserveA += amountA;
        reserveB += amountB;
        emit LiquidityAdded(msg.sender, amountA, amountB);
    }

    function getAmountOut(uint256 amountIn, uint256 resIn, uint256 resOut) public pure returns (uint256) {
        uint256 amountInWithFee = amountIn * (1000 - FEE);
        return (amountInWithFee * resOut) / (resIn * 1000 + amountInWithFee);
    }

    function swapAtoB(uint256 amountIn, uint256 minAmountOut) external {
        uint256 amountOut = getAmountOut(amountIn, reserveA, reserveB);
        require(amountOut >= minAmountOut, "Slippage too high");
        require(amountOut <= reserveB, "Insufficient liquidity");
        tokenA.transferFrom(msg.sender, address(this), amountIn);
        tokenB.transfer(msg.sender, amountOut);
        reserveA += amountIn;
        reserveB -= amountOut;
        emit Swap(msg.sender, address(tokenA), amountIn, amountOut);
    }

    function swapBtoA(uint256 amountIn, uint256 minAmountOut) external {
        uint256 amountOut = getAmountOut(amountIn, reserveB, reserveA);
        require(amountOut >= minAmountOut, "Slippage too high");
        require(amountOut <= reserveA, "Insufficient liquidity");
        tokenB.transferFrom(msg.sender, address(this), amountIn);
        tokenA.transfer(msg.sender, amountOut);
        reserveB += amountIn;
        reserveA -= amountOut;
        emit Swap(msg.sender, address(tokenB), amountIn, amountOut);
    }

    function getReserves() external view returns (uint256, uint256) {
        return (reserveA, reserveB);
    }
}
