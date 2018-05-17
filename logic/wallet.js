import { ec } from 'elliptic';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import _ from 'lodash';
import { getPublicKey, getTransactionId, signTxIn, Transaction, TxIn, TxOut } from './transaction';

const EC = new ec('secp256k1');
const privateKeyLocation = process.env.PRIVATE_KEY || 'node/wallet/private_key';

/**
 * Get a Private key
 * @return {string}
 * */
const getPrivateFromWallet = () => {
	const buffer = readFileSync(privateKeyLocation, 'utf8');
	return buffer.toString();
};

/**
 * Get a Public key (=address)
 * @return {string}
 * */
const getPublicFromWallet = () => {
	const privateKey = getPrivateFromWallet();
	const key = EC.keyFromPrivate(privateKey, 'hex');
	return key.getPublic().encode('hex');
};

/**
 * Create a Private key
 * @return {string}
 * */
const generatePrivateKey = () => {
	const keyPair = EC.genKeyPair();
	const privateKey = keyPair.getPrivate();
	return privateKey.toString(16);
};

/**
 * Only one wallet by user
 * @return {void}
 * */
const initWallet = () => {
	// let's not override existing private keys
	if (existsSync(privateKeyLocation)) {
		return;
	}

	const newPrivateKey = generatePrivateKey();

	writeFileSync(privateKeyLocation, newPrivateKey);
	console.log('new wallet with private key created to : %s', privateKeyLocation);
};

const deleteWallet = () => {
	if (existsSync(privateKeyLocation)) {
		unlinkSync(privateKeyLocation);
	}
};

/**
 * Get the amount of a address
 * @param {string} address
 * @param {array} unspentTxOuts
 * @return {number}
 * */
const getBalance = (address, unspentTxOuts) => {
	return _(findUnspentTxOuts(address, unspentTxOuts))
		.map((uTxO) => uTxO.amount)
		.sum();
};

/**
 *
 * @param {string} ownerAddress
 * @param {array} unspentTxOuts
 * @return {array}
 * */
const findUnspentTxOuts = (ownerAddress, unspentTxOuts) => {
	return _.filter(unspentTxOuts, (uTxO) => uTxO.address === ownerAddress);
};

/**
 * Generating transactions - create the transaction inputs
 *
 * @param {number} amount
 * @param {array} myUnspentTxOuts
 * @return {object}
 * */
const findTxOutsForAmount = (amount, myUnspentTxOuts) => {
	let currentAmount = 0;
	const includedUnspentTxOuts = [];

	for (const myUnspentTxOut of myUnspentTxOuts) {
		includedUnspentTxOuts.push(myUnspentTxOut);
		currentAmount = currentAmount + myUnspentTxOut.amount;

		if (currentAmount >= amount) {
			const leftOverAmount = currentAmount - amount; // the value to send back to our address
			return { includedUnspentTxOuts, leftOverAmount };
		}
	}

	const eMsg = 'Cannot create transaction from the available unspent transaction outputs. Required amount:' + amount + '. Available unspentTxOuts:' + JSON.stringify(myUnspentTxOuts);
	throw Error(eMsg);
};

/**
 *
 * @param {string} receiverAddress
 * @param {string} myAddress
 * @param {number} amount
 * @param {number} leftOverAmount
 *
 * @return {array}
 * */
const createTxOuts = (receiverAddress, myAddress, amount, leftOverAmount) => {
	const txOut1 = new TxOut(receiverAddress, amount);

	if (leftOverAmount === 0) {
		return [txOut1];
	} else {
		const leftOverTx = new TxOut(myAddress, leftOverAmount);
		return [txOut1, leftOverTx];
	}
};

/**
 *
 * @param {array} unspentTxOuts
 * @param {array} transactionPool
 *
 * @return {array}
 * */
const filterTxPoolTxs = (unspentTxOuts, transactionPool) => {
	const txIns = _(transactionPool)
		.map((tx) => tx.txIns)
		.flatten()
		.value();

	const removable = [];

	for (const unspentTxOut of unspentTxOuts) {
		const txIn = _.find(txIns, (aTxIn) => {
			return aTxIn.txOutIndex === unspentTxOut.txOutIndex && aTxIn.txOutId === unspentTxOut.txOutId;
		});

		if (txIn === undefined) {
			// ...
		} else {
			removable.push(unspentTxOut);
		}
	}

	return _.without(unspentTxOuts, ...removable);
};

/**
 *
 * @param {string} receiverAddress
 * @param {number} amount
 * @param {string} privateKey
 * @param {array} unspentTxOuts
 * @param {array} txPool
 *
 * @return {object}
 * */
const createTransaction = (receiverAddress, amount, privateKey, unspentTxOuts, txPool) => {
	console.log('txPool: %s', JSON.stringify(txPool));
	const myAddress = getPublicKey(privateKey); // string
	const myUnspentTxOutsA = unspentTxOuts.filter((uTxO) => uTxO.address === myAddress);

	const myUnspentTxOuts = filterTxPoolTxs(myUnspentTxOutsA, txPool);

	// filter from unspentOutputs such inputs that are referenced in pool
	const {includedUnspentTxOuts, leftOverAmount} = findTxOutsForAmount(amount, myUnspentTxOuts);

	const toUnsignedTxIn = (unspentTxOut) => {
		const txIn = new TxIn();
		txIn.txOutId = unspentTxOut.txOutId;
		txIn.txOutIndex = unspentTxOut.txOutIndex;
		return txIn;
	};

	const unsignedTxIns = includedUnspentTxOuts.map(toUnsignedTxIn);

	const tx = new Transaction();
	tx.txIns = unsignedTxIns;
	tx.txOuts = createTxOuts(receiverAddress, myAddress, amount, leftOverAmount);
	tx.id = getTransactionId(tx);

	tx.txIns = tx.txIns.map((txIn, index) => {
		txIn.signature = signTxIn(tx, index, privateKey, unspentTxOuts);
		return txIn;
	});

	return tx;
};

export { createTransaction, getPublicFromWallet, getPrivateFromWallet, getBalance, generatePrivateKey, initWallet, deleteWallet, findUnspentTxOuts };
