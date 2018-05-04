import * as CryptoJS from 'crypto-js';
import { broadcastLatest } from './p2p';

class Block {
	constructor(index, hash, previousHash, timestamp, data) {
		this.index = index;
		this.previousHash = previousHash;
		this.timestamp = timestamp;
		this.data = data;
		this.hash = hash;
	}
}

const genesisBlock = new Block(0, '816534932c2b7154836da6afc367695e6337db8a921823784c14378abed4f7d7', '', 1465154705, 'my genesis block!!');
let blockchain = [genesisBlock];


const getBlockchain = () => {
	return blockchain;
};

const getLatestBlock = () => {
	return blockchain[blockchain.length - 1];
};

const generateNextBlock = (blockData) => {
	const previousBlock = getLatestBlock();
	const nextIndex = previousBlock.index + 1;
	const nextTimestamp = new Date().getTime() / 1000;
	const nextHash = calculateHash(nextIndex, previousBlock.hash, nextTimestamp, blockData);
	const newBlock = new Block(nextIndex, nextHash, previousBlock.hash, nextTimestamp, blockData);

	addBlock(newBlock);
	broadcastLatest();

	return newBlock;
};

const calculateHashForBlock = (block) => {
	return calculateHash(block.index, block.previousHash, block.timestamp, block.data);
};

const calculateHash = (index, previousHash, timestamp, data) => {
	CryptoJS.SHA256(index + previousHash + timestamp + data).toString();
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
	} else if (calculateHashForBlock(newBlock) !== newBlock.hash) {
		console.log(typeof (newBlock.hash) + ' ' + typeof calculateHashForBlock(newBlock));
		console.log('invalid hash: ' + calculateHashForBlock(newBlock) + ' ' + newBlock.hash);
		return false;
	}

	return true;
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
 * For case of block's conflicts we choosing the longest blockchain
 * */
const replaceChain = (newBlocks) => {
	if (isValidChain(newBlocks) && newBlocks.length > getBlockchain().length) {
		console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');
		blockchain = newBlocks;
		broadcastLatest();
	} else {
		console.log('Received blockchain invalid');
	}
};

export { Block, getBlockchain, getLatestBlock, generateNextBlock, isValidBlockStructure, replaceChain, addBlockToChain };
