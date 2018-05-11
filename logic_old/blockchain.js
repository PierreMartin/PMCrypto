import * as CryptoJS from 'crypto-js';
import { broadcastLatest } from './p2p';
import { processTransactions } from './transaction';
import { hexToBinary } from './util';

const BLOCK_GENERATION_INTERVAL = 10; // in seconds - mining - defines how often a block should be found
const DIFFICULTY_ADJUSTMENT_INTERVAL = 10; // in blocks - mining - defines how often the difficulty should adjust to the increasing or decreasing network hashrate

class Block {
	constructor(index, hash, previousHash, timestamp, data, difficulty, nonce) {
		this.index = index;
		this.previousHash = previousHash;
		this.timestamp = timestamp;
		this.data = data;
		this.hash = hash;
		this.difficulty = difficulty; // Number - Defines how many prefixing zeros the block hash must have - for the block to be valid
		this.nonce = nonce; // Number - used for calculate different hashes for the same content of the block - for find a hash that satisfies the difficulty
	}
}

const genesisBlock = new Block(0, '91a73664bc84c0baa1fc75ea6e4aa6d1d20c5df664c724e3159aefc2e1186627', '', 1465154705, [], 0, 0);

let blockchain = [genesisBlock];
let unspentTxOuts = [];

const getBlockchain = () => blockchain;
const getLatestBlock = () => blockchain[blockchain.length - 1];

/**
 * ## Mining
 * Get the difficulty of the last block
 *
 * @param {array} aBlockchain - the full blockchain
 * @return {number} the difficulty
 * */
const getDifficulty = (aBlockchain) => {
	const latestBlock = aBlockchain[blockchain.length - 1];

	// For every 10 blocks that is generated, we check if the time that took to generate those blocks are larger or smaller than the expected time
	if (latestBlock.index % DIFFICULTY_ADJUSTMENT_INTERVAL === 0 && latestBlock.index !== 0) {
		return getAdjustedDifficulty(latestBlock, aBlockchain);
	} else {
		return latestBlock.difficulty;
	}
};

/**
 * ## Mining ajusted difficulty
 * If blocks are mined too often, the difficulty of the puzzle will increase
 * We increase or decrease the difficulty if the time taken is at least two times greater or smaller than the expected difficulty
 *
 * @param {object} latestBlock - the lastest block
 * @param {array} aBlockchain - the full blockchain
 *
 * @return {number} the difficulty ajusted
 * */
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
	const nextIndex = previousBlock.index + 1;
	const nextTimestamp = getCurrentTimestamp();
	const newBlock = findBlock(nextIndex, previousBlock.hash, nextTimestamp, blockData, difficulty);

	if(addBlockToChain(newBlock)) {
		broadcastLatest();
		return newBlock;
	} else {
		return null;
	}
};

/**
 * ## Mining core
 * To find a valid block hash we must increase the 'nonce' as until we get a valid hash
 *
 * @param {number} index - the index of the block
 * @param {string} previousHash - the previousHash of the block
 * @param {number} timestamp - the timestamp of the block
 * @param {array} data - the data of the block
 * @param {number} difficulty - the difficulty of the block
 *
 * @return {array} a new block (if the hash is correct in terms of difficulty)
 * */
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
const calculateHash = (index, previousHash, timestamp, data, difficulty, nonce) => CryptoJS.SHA256(index + previousHash + timestamp + data + difficulty + nonce).toString();

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
		&& typeof block.data === 'object';
};

/**
 * Validating a block - when we receive new blocks from other nodes and must decide whether to accept them or not
 * */
const isValidNewBlock = (newBlock, previousBlock) => {
	if (!isValidBlockStructure(newBlock)) {
		console.log('invalid structure');
		console.log(newBlock);
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

/**
 * ## Mining
 * Cumulate the difficulties
 *
 * @param {array} aBlockchain - the full blockchain
 * @return {number}
 * */
const getAccumulatedDifficulty = (aBlockchain) => {
	return aBlockchain
		.map((block) => block.difficulty)
		.map((difficulty) => Math.pow(2, difficulty))
		.reduce((a, b) => a + b);
};

/**
 * ## Mining
 * Timestamp validation - for avoid the attacks
 * - A block is valid, if the timestamp is at most 1 min in the future from the time we perceive
 * - A block in the chain is valid, if the timestamp is at most 1 min in the past of the previous block.
 *
 * @param {object} newBlock
 * @param {object} previousBlock
 *
 * @return {boolean}
 * */
const isValidTimestamp = (newBlock, previousBlock) => {
	return (previousBlock.timestamp - 60 < newBlock.timestamp) && newBlock.timestamp - 60 < getCurrentTimestamp();
};

/**
 * ## Mining
 * Check if the hash of the block is valid
 *
 * @param {object} block
 * @return {boolean}
 * */
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

/**
 * ## Mining
 * Check if the hash of the block match
 *
 * @param {object} block
 * @return {boolean}
 * */
const hashMatchesBlockContent = (block) => {
	const blockHash = calculateHashForBlock(block);
	return blockHash === block.hash;
};

/**
 * ## Mining
 * Checks that the hash is correct in terms of difficulty
 * The prefixing zeros are checked from the binary format of the hash (example 00001001010001)
 *
 * @param {string} hash - the hash of block
 * @param {number} difficulty - the difficulty of block
 * @return {boolean}
 * */
const hashMatchesDifficulty = (hash, difficulty) => {
	const hashInBinary = hexToBinary(hash);
	const requiredPrefix = '0'.repeat(difficulty);

	return hashInBinary.startsWith(requiredPrefix);
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
		const retVal = processTransactions(newBlock.data, unspentTxOuts, newBlock.index);

		if (retVal === null) {
			return false;
		} else {
			blockchain.push(newBlock);
			unspentTxOuts = retVal;
			return true;
		}
	}

	return false;
};

/**
 * The correct chain will be the longest cumulate difficulty
 * In other words, the correct chain is the chain which required most resources (= hashRate * time) to produce
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
