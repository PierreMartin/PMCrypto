import _ from 'lodash';
import { validateTransaction } from './transaction';

let transactionPool = [];

/**
 * Transaction pool is a structure that contains all of the “unconfirmed transactions” our node know
 * */
const getTransactionPool = () => {
	return _.cloneDeep(transactionPool);
};

/**
 * Add transaction to the Pool
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
 * We must revalidate the transaction pool every time a new block is found
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
 * As the peers can send us any kind of transactions, we must validate the transactions before we can add them to the transaction pool
 * There is no way to remove a transaction from the transaction pool. The transaction pool will however be updated each time a new block is found
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
