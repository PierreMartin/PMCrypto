import _ from 'lodash';
import { validateTransaction } from './transaction';

let transactionPool = [];


const getTransactionPool = () => {
	return _.cloneDeep(transactionPool);
};

/**
 *
 * @param {object} tx
 * @param {array} unspentTxOuts
 * */
const addToTransactionPool = (tx, unspentTxOuts) => {
	if (!validateTransaction(tx, unspentTxOuts)) {
		throw Error('Trying to add invalid tx to pool');
	}

	if (!isValidTxForPool(tx, transactionPool)) {
		throw Error('Trying to add invalid tx to pool');
	}

	console.log('adding to txPool: %s', JSON.stringify(tx));
	transactionPool.push(tx);
};

/**
 *
 * @param {object} txIn
 * @param {array} unspentTxOuts
 * @return {boolean}
 * */
const hasTxIn = (txIn, unspentTxOuts) => {
	const foundTxIn = unspentTxOuts.find((uTxO) => {
		return uTxO.txOutId === txIn.txOutId && uTxO.txOutIndex === txIn.txOutIndex;
	});
	return foundTxIn !== undefined;
};

/**
 *
 * @param {array} unspentTxOuts
 * @return {boolean}
 * */
const updateTransactionPool = (unspentTxOuts) => {
	const invalidTxs = [];

	for (const tx of transactionPool) {
		for (const txIn of tx.txIns) {
			if (!hasTxIn(txIn, unspentTxOuts)) {
				invalidTxs.push(tx);
				break;
			}
		}
	}

	if (invalidTxs.length > 0) {
		console.log('removing the following transactions from txPool: %s', JSON.stringify(invalidTxs));
		transactionPool = _.without(transactionPool, ...invalidTxs);
	}
};

/**
 *
 * @param {array} aTransactionPool
 * @return {array}
 * */
const getTxPoolIns = (aTransactionPool) => {
	return _(aTransactionPool)
		.map((tx) => tx.txIns)
		.flatten()
		.value();
};

/**
 *
 * @param {object} tx
 * @param {array} aTtransactionPool
 * @return {boolean}
 * */
const isValidTxForPool = (tx, aTtransactionPool) => {
	const txPoolIns = getTxPoolIns(aTtransactionPool); // array

	const containsTxIn = (txIns, txIn) => {
		return _.find(txPoolIns, ((txPoolIn) => {
			return txIn.txOutIndex === txPoolIn.txOutIndex && txIn.txOutId === txPoolIn.txOutId;
		}));
	};

	for (const txIn of tx.txIns) {
		if (containsTxIn(txPoolIns, txIn)) {
			console.log('txIn already found in the txPool');
			return false;
		}
	}

	return true;
};

export { addToTransactionPool, getTransactionPool, updateTransactionPool };
