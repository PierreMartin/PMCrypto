import * as CryptoJS from 'crypto-js';
import * as ecdsa from 'elliptic';
import _ from 'lodash';

const ec = new ecdsa.ec('secp256k1');

// The coinbase transaction contains only an output, but no inputs - this means that a coinbase transaction adds new coins to circulation :
const COINBASE_AMOUNT = 50;


/**
 * unspent transaction outputs
 * A transaction input must always refer to an unspent transaction output
 * We will update the list of unspent transaction outputs as we process and include the transactions to the blockchain
 * */
class UnspentTxOut {
	constructor(txOutId, txOutIndex, address, amount) {
		this.txOutId = txOutId;
		this.txOutIndex = txOutIndex;
		this.address = address;
		this.amount = amount;
	}
}

/**
 * Transaction outputs (The receiver - lock the coin)
 * */
class TxOut {
	constructor(address, amount) {
		this.address = address; // an ECDSA public-key
		this.amount = amount; // amount of coins
	}
}

/**
 * Transaction inputs (The sender, unlock the coin)
 * These unlocked coins are now ‘available’ for the TxOut
 * The signature gives proof that only the user, that has the private-key of the referred public-key ( =address) could have created the transaction
 * */
class TxIn {
	constructor(address, amount) {
		this.txOutId = txOutId;
		this.txOutIndex = txOutIndex;
		this.signature = signature;
	}
}

class Transaction {
	// public id; // string
	// public txIns; // arr
	// public txOuts; // arr
}

/**
 * Get id of the transaction => create a hash from the contents of the transaction
 * @param {object} transaction
 * @return {string}
 * */
const getTransactionId = (transaction) => {
	const txInContent = transaction.txIns
		.map((txIn) => txIn.txOutId + txIn.txOutIndex)
		.reduce((a, b) => a + b, '');

	const txOutContent = transaction.txOuts
		.map((txOut) => txOut.address + txOut.amount)
		.reduce((a, b) => a + b, '');

	return CryptoJS.SHA256(txInContent + txOutContent).toString();
};

/**
 * Validate Transaction
 * @param {object} transaction
 * @param {array} aUnspentTxOuts
 * @return {boolean}
 * */
const validateTransaction = (transaction, aUnspentTxOuts) => {
	if (getTransactionId(transaction) !== transaction.id) {
		console.log('invalid tx id: ' + transaction.id);
		return false;
	}

	const hasValidTxIns = transaction.txIns
		.map((txIn) => validateTxIn(txIn, transaction, aUnspentTxOuts))
		.reduce((a, b) => a && b, true);

	if (!hasValidTxIns) {
		console.log('some of the txIns are invalid in tx: ' + transaction.id);
		return false;
	}

	// The sums of the values specified in the outputs must be equal to the sums of the values specified in the inputs
	const totalTxInValues = transaction.txIns
		.map((txIn) => getTxInAmount(txIn, aUnspentTxOuts))
		.reduce((a, b) => (a + b), 0);

	const totalTxOutValues = transaction.txOuts
		.map((txOut) => txOut.amount)
		.reduce((a, b) => (a + b), 0);

	if (totalTxOutValues !== totalTxInValues) {
		console.log('totalTxOutValues !== totalTxInValues in tx: ' + transaction.id);
		return false;
	}

	return true;
};

/**
 * Validate Block Transactions
 * @param {array} aTransactions
 * @param {array} aUnspentTxOuts
 * @param {number} blockIndex
 * @return {boolean}
 * */
const validateBlockTransactions = (aTransactions, aUnspentTxOuts, blockIndex) => {
	const coinbaseTx = aTransactions[0];
	if (!validateCoinbaseTx(coinbaseTx, blockIndex)) {
		console.log('invalid coinbase transaction: ' + JSON.stringify(coinbaseTx));
		return false;
	}

	// check for duplicate txIns. Each txIn can be included only once
	const txIns = _(aTransactions)
		.map(tx => tx.txIns)
		.flatten()
		.value();

	if (hasDuplicates(txIns)) {
		return false;
	}

	// all but coinbase transactions
	const normalTransactions = aTransactions.slice(1);

	return normalTransactions
		.map((tx) => validateTransaction(tx, aUnspentTxOuts))
		.reduce((a, b) => (a && b), true);
};

/**
 * Check if txIns duplicate
 * @param {array} txIns
 * @return {boolean}
 * */
const hasDuplicates = (txIns) => {
	const groups = _.countBy(txIns, (txIn) => txIn.txOutId + txIn.txOutId);

	return _(groups)
		.map((value, key) => {
			if (value > 1) {
				console.log('duplicate txIn: ' + key);
				return true;
			} else {
				return false;
			}
		})
		.includes(true);
};


/**
 * Get TxIn Amount
 * @param {object} txIn
 * @param {array} aUnspentTxOuts
 * @return {number}
 * */
const getTxInAmount = (txIn, aUnspentTxOuts) => {
	return findUnspentTxOut(txIn.txOutId, txIn.txOutIndex, aUnspentTxOuts).amount;
};

/**
 * Get Unspent TxOut
 * @param {string} transactionId
 * @param {number} index
 * @param {array} aUnspentTxOuts
 * @return {object}
 * */
const findUnspentTxOut = (transactionId, index, aUnspentTxOuts) => {
	return aUnspentTxOuts.find((uTxO) => uTxO.txOutId === transactionId && uTxO.txOutIndex === index);
};

/**
 * Get Coinbase Transaction
 * @param {string} address
 * @param {number} blockIndex
 * @return {object}
 * */
const getCoinbaseTransaction = (address, blockIndex) => {
	const t = new Transaction();
	const txIn = new TxIn();
	txIn.signature = "";
	txIn.txOutId = "";
	txIn.txOutIndex = blockIndex;

	t.txIns = [txIn];
	t.txOuts = [new TxOut(address, COINBASE_AMOUNT)];
	t.id = getTransactionId(t);

	return t;
};

/**
 * Validate the Transaction Input
 * For make the contents of the transaction cannot be modified after it has been signed
 *
 * @param {object} transaction
 * @param {number} txInIndex
 * @param {string} privateKey
 * @param {array} aUnspentTxOuts
 *
 * @return {string}
 * */
const signTxIn = (transaction, txInIndex, privateKey, aUnspentTxOuts) => {
	const txIn = transaction.txIns[txInIndex];
	const dataToSign = transaction.id;
	const referencedUnspentTxOut = findUnspentTxOut(txIn.txOutId, txIn.txOutIndex, aUnspentTxOuts);

	if(referencedUnspentTxOut == null) {
		console.log('could not find referenced txOut');
		throw Error();
	}

	const referencedAddress = referencedUnspentTxOut.address;

	if (getPublicKey(privateKey) !== referencedAddress) {
		console.log('trying to sign an input with private key that does not match the address that is referenced in txIn');
		throw Error();
	}

	const key = ec.keyFromPrivate(privateKey, 'hex');
	const signature = toHexString(key.sign(dataToSign).toDER());

	return signature;
};

/**
 * update Unspent TxOuts
 *
 * @param {array} newTransactions
 * @param {array} aUnspentTxOuts
 * @return {array}
 * */
const updateUnspentTxOuts = (newTransactions, aUnspentTxOuts) => {
	// Every time a new block is added to the chain, we must update our list of unspent transaction outputs
	// Get all new unspent transaction outputs from the new block
	const newUnspentTxOuts = newTransactions
		.map((t) => {
			return t.txOuts.map((txOut, index) => new UnspentTxOut(t.id, index, txOut.address, txOut.amount));
		})
		.reduce((a, b) => a.concat(b), []);

	// Get all transaction outputs are consumed by the new transactions of the block
	const consumedTxOuts = newTransactions
		.map((t) => t.txIns)
		.reduce((a, b) => a.concat(b), [])
		.map((txIn) => new UnspentTxOut(txIn.txOutId, txIn.txOutIndex, '', 0));

	// We generate the new unspent transaction outputs by removing the consumedTxOuts and adding the newUnspentTxOuts to our existing transaction outputs
	const resultingUnspentTxOuts = aUnspentTxOuts
		.filter(((uTxO) => !findUnspentTxOut(uTxO.txOutId, uTxO.txOutIndex, consumedTxOuts)))
		.concat(newUnspentTxOuts);

	return resultingUnspentTxOuts;
};

/**
 * Process Transactions
 *
 * @param {array} aTransactions
 * @param {array} aUnspentTxOuts
 * @param {number} blockIndex
 * @return {mixed}
 * */
const processTransactions = (aTransactions, aUnspentTxOuts, blockIndex) => {
	if (!isValidTransactionsStructure(aTransactions)) {
		return null;
	}

	if (!validateBlockTransactions(aTransactions, aUnspentTxOuts, blockIndex)) {
		console.log('invalid block transactions');
		return null;
	}
	return updateUnspentTxOuts(aTransactions, aUnspentTxOuts);
};


/**
 * convert string to hexa
 * @param {string} byteArray
 * @return {string} in hexa
 * */
const toHexString = (byteArray) => {
	return Array.from(byteArray, (byte) => {
		return ('0' + (byte & 0xFF).toString(16)).slice(-2);
	}).join('');
};

/**
 * Get Public Key
 * @param {string} aPrivateKey
 * @return {string}
 * */
const getPublicKey = (aPrivateKey) => {
	return ec.keyFromPrivate(aPrivateKey, 'hex').getPublic().encode('hex');
};

/**
 * Transactions validation - The signatures in the txIns must be valid
 * @param {object} txIn
 * @param {object} transaction
 * @param {array} aUnspentTxOuts
 * @return {boolean}
 * */
const validateTxIn = (txIn, transaction, aUnspentTxOuts) => {
	const referencedUTxOut = aUnspentTxOuts.find((uTxO) => uTxO.txOutId === txIn.txOutId && uTxO.txOutId === txIn.txOutId);
	if (referencedUTxOut == null) {
		console.log('referenced txOut not found: ' + JSON.stringify(txIn));
		return false;
	}

	const address = referencedUTxOut.address;
	const key = ec.keyFromPublic(address, 'hex');

	return key.verify(transaction.id, txIn.signature);
};

/**
 * Transactions validation - The validation of the coinbase transaction differs slightly from the validation of a “normal” transaction
 * @param {object} transaction
 * @param {number} blockIndex
 * @return {boolean}
 * */
const validateCoinbaseTx = (transaction, blockIndex) => {
	if (transaction == null) {
		console.log('the first transaction in the block must be coinbase transaction');
		return false;
	}

	if (getTransactionId(transaction) !== transaction.id) {
		console.log('invalid coinbase tx id: ' + transaction.id);
		return false;
	}

	if (transaction.txIns.length !== 1) {
		console.log('one txIn must be specified in the coinbase transaction');
		return;
	}

	if (transaction.txIns[0].txOutIndex !== blockIndex) {
		console.log('the txIn index in coinbase tx must be the block height');
		return false;
	}

	if (transaction.txOuts.length !== 1) {
		console.log('invalid number of txOuts in coinbase transaction');
		return false;
	}

	if (transaction.txOuts[0].amount != COINBASE_AMOUNT) {
		console.log('invalid coinbase amount in coinbase transaction');
		return false;
	}

	return true;
};

/**
 * Transactions validation
 * @param {object} txIn
 * @return {boolean}
 * */
const isValidTxInStructure = (txIn) => {
	if (txIn == null) {
		console.log('txIn is null');
		return false;
	} else if (typeof txIn.signature !== 'string') {
		console.log('invalid signature type in txIn');
		return false;
	} else if (typeof txIn.txOutId !== 'string') {
		console.log('invalid txOutId type in txIn');
		return false;
	} else if (typeof  txIn.txOutIndex !== 'number') {
		console.log('invalid txOutIndex type in txIn');
		return false;
	} else {
		return true;
	}
};

/**
 * Transactions validation
 * @param {object} txOut
 * @return {boolean}
 * */
const isValidTxOutStructure = (txOut) => {
	if (txOut == null) {
		console.log('txOut is null');
		return false;
	} else if (typeof txOut.address !== 'string') {
		console.log('invalid address type in txOut');
		return false;
	} else if (!isValidAddress(txOut.address)) {
		console.log('invalid TxOut address');
		return false;
	} else if (typeof txOut.amount !== 'number') {
		console.log('invalid amount type in txOut');
		return false;
	} else {
		return true;
	}
};

/**
 * Transactions validation
 * @param {array} transactions
 * @return {boolean}
 * */
const isValidTransactionsStructure = (transactions) => {
	return transactions
		.map(isValidTransactionStructure)
		.reduce((a, b) => (a && b), true);
};

/**
 * Transactions validation - Correct transaction structure
 * @param {object} transaction
 * @return {boolean}
 * */
const isValidTransactionStructure = (transaction) => {
	if (typeof transaction.id !== 'string') {
		console.log('transactionId missing');
		return false;
	}

	if (!(transaction.txIns instanceof Array)) {
		console.log('invalid txIns type in transaction');
		return false;
	}

	if (!transaction.txIns
			.map(isValidTxInStructure)
			.reduce((a, b) => (a && b), true)) {
		return false;
	}

	if (!(transaction.txOuts instanceof Array)) {
		console.log('invalid txIns type in transaction');
		return false;
	}

	if (!transaction.txOuts.map(isValidTxOutStructure).reduce((a, b) => (a && b), true)) {
		return false;
	}

	return true;
};

/**
 * Transactions validation - valid address is a valid ecdsa public key in the 04 + X-coordinate + Y-coordinate format
 * @param {string} address
 * @return {boolean}
 * */
const isValidAddress = (address) => {
	if (address.length !== 130) {
		console.log('invalid public key length');
		return false;
	} else if (address.match('^[a-fA-F0-9]+$') === null) {
		console.log('public key must contain only hex characters');
		return false;
	} else if (!address.startsWith('04')) {
		console.log('public key must start with 04');
		return false;
	}

	return true;
};

export { processTransactions, signTxIn, getTransactionId, UnspentTxOut, TxIn, TxOut, getCoinbaseTransaction, getPublicKey, Transaction }
