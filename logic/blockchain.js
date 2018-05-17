import * as CryptoJS from 'crypto-js';
import _ from 'lodash';
import { broadcastLatest, broadCastTransactionPool } from './p2p';
import { getCoinbaseTransaction, isValidAddress, processTransactions } from './transaction';
import { addToTransactionPool, getTransactionPool, updateTransactionPool } from './transactionPool';
import { hexToBinary } from './util';
import { createTransaction, findUnspentTxOuts, getBalance, getPrivateFromWallet, getPublicFromWallet } from './wallet';

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

const genesisTransaction = {
	'txIns': [{'signature': '', 'txOutId': '', 'txOutIndex': 0}],
	'txOuts': [{
		'address': '04bfcab8722991ae774db48f934ca79cfb7dd991229153b9f732ba5334aafcd8e7266e47076996b55a14bf9913ee3145ce0cfc1372ada8ada74bd287450313534a',
		'amount': 50
	}],
	'id': 'e655f6a5f26dc9b4cac6e46f52336428287759cf81ef5ff10854f69d68f43fa3'
};

const genesisBlock = new Block(0, '91a73664bc84c0baa1fc75ea6e4aa6d1d20c5df664c724e3159aefc2e1186627', '', 1465154705, [genesisTransaction], 0, 0);

let blockchain = [genesisBlock];

// the unspent txOut of genesis block is set to unspentTxOuts on startup
let unspentTxOuts = processTransactions(blockchain[0].data, [], 0);

const getBlockchain = () => blockchain;
const getUnspentTxOuts = () => _.cloneDeep(unspentTxOuts);

// and txPool should be only updated at the same time
const setUnspentTxOuts = (newUnspentTxOut) => {
	console.log('replacing unspentTxouts with: %s', newUnspentTxOut);
	unspentTxOuts = newUnspentTxOut;
};

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

const generateRawNextBlock = (blockData) => {
	const previousBlock = getLatestBlock();
	const difficulty = getDifficulty(getBlockchain());
	const nextIndex = previousBlock.index + 1;
	const nextTimestamp = getCurrentTimestamp();
	const newBlock = findBlock(nextIndex, previousBlock.hash, nextTimestamp, blockData, difficulty);

	if (addBlockToChain(newBlock)) {
		broadcastLatest();
		return newBlock;
	} else {
		return null;
	}

};

// gets the unspent transaction outputs owned by the wallet
const getMyUnspentTransactionOutputs = () => {
	return findUnspentTxOuts(getPublicFromWallet(), getUnspentTxOuts());
};

/**
 * The unconfirmed transaction will find its way from the local transaction pool to a block mined by the same node
 * */
const generateNextBlock = () => {
	const coinbaseTx = getCoinbaseTransaction(getPublicFromWallet(), getLatestBlock().index + 1);
	const blockData = [coinbaseTx].concat(getTransactionPool());

	return generateRawNextBlock(blockData);
};

const generatenextBlockWithTransaction = (receiverAddress, amount) => {
	if (!isValidAddress(receiverAddress)) {
		throw Error('invalid address');
	}

	if (typeof amount !== 'number') {
		throw Error('invalid amount');
	}

	const coinbaseTx = getCoinbaseTransaction(getPublicFromWallet(), getLatestBlock().index + 1);
	const tx = createTransaction(receiverAddress, amount, getPrivateFromWallet(), getUnspentTxOuts(), getTransactionPool());
	const blockData = [coinbaseTx, tx];

	return generateRawNextBlock(blockData);
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

const getAccountBalance = () => {
	return getBalance(getPublicFromWallet(), getUnspentTxOuts());
};

/**
 * create transaction - We add the created transaction to the pool
 * */
const sendTransaction = (address, amount) => {
	const tx = createTransaction(address, amount, getPrivateFromWallet(), getUnspentTxOuts(), getTransactionPool());
	addToTransactionPool(tx, getUnspentTxOuts());
	broadCastTransactionPool();

	return tx;
};

const calculateHashForBlock = (block) =>
	calculateHash(block.index, block.previousHash, block.timestamp, block.data, block.difficulty, block.nonce);

const calculateHash = (index, previousHash, timestamp, data, difficulty, nonce) => CryptoJS.SHA256(index + previousHash + timestamp + data + difficulty + nonce).toString();

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
		console.log('invalid block structure: %s', JSON.stringify(newBlock));
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
 * Checks if the given blockchain is valid. Return the unspent txOuts if the chain is valid
 * */
const isValidChain = (blockchainToValidate) => {
	console.log('isValidChain:');
	console.log(JSON.stringify(blockchainToValidate));
	const isValidGenesis = (block) => {
		return JSON.stringify(block) === JSON.stringify(genesisBlock);
	};

	if (!isValidGenesis(blockchainToValidate[0])) {
		return null;
	}

	// Validate each block in the chain. The block is valid if the block structure is valid and the transaction are valid
	let aUnspentTxOuts = [];

	for (let i = 0; i < blockchainToValidate.length; i++) {
		const currentBlock = blockchainToValidate[i];

		if (i !== 0 && !isValidNewBlock(blockchainToValidate[i], blockchainToValidate[i - 1])) {
			return null;
		}

		aUnspentTxOuts = processTransactions(currentBlock.data, aUnspentTxOuts, currentBlock.index);
		if (aUnspentTxOuts === null) {
			console.log('invalid transactions in blockchain');
			return null;
		}
	}

	return aUnspentTxOuts;
};

const addBlockToChain = (newBlock) => {
	if (isValidNewBlock(newBlock, getLatestBlock())) {
		const retVal = processTransactions(newBlock.data, getUnspentTxOuts(), newBlock.index);

		if (retVal === null) {
			console.log('block is not valid in terms of transactions');
			return false;
		} else {
			blockchain.push(newBlock);
			setUnspentTxOuts(retVal);
			updateTransactionPool(unspentTxOuts);
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
	const aUnspentTxOuts = isValidChain(newBlocks);
	const validChain = aUnspentTxOuts !== null;

	if (validChain &&
		getAccumulatedDifficulty(newBlocks) > getAccumulatedDifficulty(getBlockchain())) {
		console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');
		blockchain = newBlocks;
		setUnspentTxOuts(aUnspentTxOuts);
		updateTransactionPool(unspentTxOuts);
		broadcastLatest();
	} else {
		console.log('Received blockchain invalid');
	}
};

const handleReceivedTransaction = (transaction) => {
	addToTransactionPool(transaction, getUnspentTxOuts());
};

export { Block, getBlockchain, getUnspentTxOuts, getLatestBlock, sendTransaction, generateRawNextBlock, generateNextBlock, generatenextBlockWithTransaction, handleReceivedTransaction, getMyUnspentTransactionOutputs, getAccountBalance, isValidBlockStructure, replaceChain, addBlockToChain };
