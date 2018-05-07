import * as CryptoJS from 'crypto-js';
import { broadcastLatest } from './p2p';
import { hexToBinary } from './util';

const BLOCK_GENERATION_INTERVAL = 10; // in seconds
const DIFFICULTY_ADJUSTMENT_INTERVAL = 10; // in blocks

class Block {
	constructor(index, hash, previousHash, timestamp, data, difficulty, nonce) {
		this.index = index;
		this.previousHash = previousHash;
		this.timestamp = timestamp;
		this.data = data;
		this.hash = hash;
		this.difficulty = difficulty;
		this.nonce = nonce;
	}
}

const genesisBlock = new Block(0, '91a73664bc84c0baa1fc75ea6e4aa6d1d20c5df664c724e3159aefc2e1186627', '', 1465154705, 'my genesis block!!', 0, 0);

let blockchain = [genesisBlock];

const getBlockchain = () => blockchain;
const getLatestBlock = () => blockchain[blockchain.length - 1];

const getDifficulty = (aBlockchain) => {
	const latestBlock = aBlockchain[blockchain.length - 1];

	if (latestBlock.index % DIFFICULTY_ADJUSTMENT_INTERVAL === 0 && latestBlock.index !== 0) {
		return getAdjustedDifficulty(latestBlock, aBlockchain);
	} else {
		return latestBlock.difficulty;
	}
};

const getAdjustedDifficulty = (latestBlock, aBlockchain) => {
	const prevAdjustmentBlock = aBlockchain[blockchain.length - DIFFICULTY_ADJUSTMENT_INTERVAL];
	const timeExpected = BLOCK_GENERATION_INTERVAL * DIFFICULTY_ADJUSTMENT_INTERVAL;
	const timeTaken = latestBlock.timestamp - prevAdjustmentBlock.timestamp;

	if (timeTaken < timeExpected / 2) {
		return prevAdjustmentBlock.difficulty + 1;
	} else if (timeTaken > timeExpected * 2) {
		return prevAdjustmentBlock.difficulty - 1;
	} else {
		return prevAdjustmentBlock.difficulty;
	}
};

const getCurrentTimestamp = () => Math.round(new Date().getTime() / 1000);

const generateNextBlock = (blockData) => {
	const previousBlock = getLatestBlock();
	const difficulty = getDifficulty(getBlockchain());
	console.log('difficulty: ' + difficulty);
	const nextIndex = previousBlock.index + 1;
	const nextTimestamp = getCurrentTimestamp();
	const newBlock = findBlock(nextIndex, previousBlock.hash, nextTimestamp, blockData, difficulty);
	addBlock(newBlock);
	broadcastLatest();

	return newBlock;
};

const findBlock = (index, previousHash, timestamp, data, difficulty) => {
	let nonce = 0;

	while (true) {
		const hash = calculateHash(index, previousHash, timestamp, data, difficulty, nonce);

		if (hashMatchesDifficulty(hash, difficulty)) {
			return new Block(index, hash, previousHash, timestamp, data, difficulty, nonce);
		}

		nonce++;
	}
};

const calculateHashForBlock = (block) => calculateHash(block.index, block.previousHash, block.timestamp, block.data, block.difficulty, block.nonce);

const calculateHash = (index, previousHash, timestamp, data, difficulty, nonce) => {
	return CryptoJS.SHA256(index + previousHash + timestamp + data + difficulty + nonce).toString();
};

const addBlock = (newBlock) => {
	if (isValidNewBlock(newBlock, getLatestBlock())) {
		blockchain.push(newBlock);
	}
};

const isValidBlockStructure = (block) => {
	return typeof block.index === 'number'
		&& typeof block.hash === 'string'
		&& typeof block.previousHash === 'string'
		&& typeof block.timestamp === 'number'
		&& typeof block.data === 'string';
};

/**
 * Validating a block - when we receive new blocks from other nodes and must decide whether to accept them or not
 * */
const isValidNewBlock = (newBlock, previousBlock) => {
	if (!isValidBlockStructure(newBlock)) {
		console.log('invalid structure');
		return false;
	}

	if (previousBlock.index + 1 !== newBlock.index) {
		console.log('invalid index');
		return false;
	} else if (previousBlock.hash !== newBlock.previousHash) {
		console.log('invalid previoushash');
		return false;
	} else if (!isValidTimestamp(newBlock, previousBlock)) {
		console.log('invalid timestamp');
		return false;
	} else if (!hasValidHash(newBlock)) {
		return false;
	}

	return true;
};

const getAccumulatedDifficulty = (aBlockchain) => {
	return aBlockchain
		.map((block) => block.difficulty)
		.map((difficulty) => Math.pow(2, difficulty))
		.reduce((a, b) => a + b);
};

const isValidTimestamp = (newBlock, previousBlock) => {
	return ( previousBlock.timestamp - 60 < newBlock.timestamp )
		&& newBlock.timestamp - 60 < getCurrentTimestamp();
};

const hasValidHash = (block) => {
	if (!hashMatchesBlockContent(block)) {
		console.log('invalid hash, got:' + block.hash);
		return false;
	}

	if (!hashMatchesDifficulty(block.hash, block.difficulty)) {
		console.log('block difficulty not satisfied. Expected: ' + block.difficulty + 'got: ' + block.hash);
	}

	return true;
};

const hashMatchesBlockContent = (block) => {
	const blockHash = calculateHashForBlock(block);
	return blockHash === block.hash;
};

const hashMatchesDifficulty = (hash, difficulty) => {
	const hashInBinary = hexToBinary(hash);
	const requiredPrefix = '0'.repeat(difficulty);

	return hashInBinary.startsWith(requiredPrefix); // return boolean
};

/**
 * Validating the full chain of blocks
 * */
const isValidChain = (blockchainToValidate) => {
	const isValidGenesis = (block) => {
		return JSON.stringify(block) === JSON.stringify(genesisBlock);
	};

	if (!isValidGenesis(blockchainToValidate[0])) {
		return false;
	}

	for (let i = 1; i < blockchainToValidate.length; i++) {
		if (!isValidNewBlock(blockchainToValidate[i], blockchainToValidate[i - 1])) {
			return false;
		}
	}

	return true;
};

const addBlockToChain = (newBlock) => {
	if (isValidNewBlock(newBlock, getLatestBlock())) {
		blockchain.push(newBlock);
		return true;
	}

	return false;
};

/**
 * For case of block's conflicts we choosing the longest cumulate difficulty
 * */
const replaceChain = (newBlocks) => {
	if (isValidChain(newBlocks) && getAccumulatedDifficulty(newBlocks) > getAccumulatedDifficulty(getBlockchain())) {
		console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');
		blockchain = newBlocks;
		broadcastLatest();
	} else {
		console.log('Received blockchain invalid');
	}
};

export { Block, getBlockchain, getLatestBlock, generateNextBlock, isValidBlockStructure, replaceChain, addBlockToChain };
