import WebSocket from 'ws';
import { Server } from 'ws';
import { addBlockToChain, Block, getBlockchain, getLatestBlock, isValidBlockStructure, replaceChain } from './blockchain';

const sockets = [];

const MessageType = {
	QUERY_LATEST: 0,
	QUERY_ALL: 1,
	RESPONSE_BLOCKCHAIN: 2
};

const initP2PServer = (p2pPort) => {
	const server = new WebSocket.Server({ port: p2pPort });
	server.on('connection', (ws) => {
		initConnection(ws);
	});

	console.log('listening websocket p2p port on: ' + p2pPort);
};

const getSockets = () => sockets;

const initConnection = (ws) => {
	sockets.push(ws);
	initMessageHandler(ws);
	initErrorHandler(ws);
	write(ws, queryChainLengthMsg());
};

const JSONToObject = (data) => {
	try {
		return JSON.parse(data);
	} catch (e) {
		console.log(e);
		return null;
	}
};

const initMessageHandler = (ws) => {
	ws.on('message', (data) => {
		const message = JSONToObject(data);
		if (message === null) {
			console.log('could not parse received JSON message: ' + data);
			return;
		}
		console.log('Received message' + JSON.stringify(message));
		switch (message.type) {
			case MessageType.QUERY_LATEST:
				write(ws, responseLatestMsg());
				break;
			case MessageType.QUERY_ALL:
				write(ws, responseChainMsg());
				break;
			case MessageType.RESPONSE_BLOCKCHAIN:
				const receivedBlocks = JSONToObject(message.data);
				if (receivedBlocks === null) {
					console.log('invalid blocks received:');
					console.log(message.data);
					break;
				}
				handleBlockchainResponse(receivedBlocks);
				break;
		}
	});
};

const write = (ws, message) => ws.send(JSON.stringify(message));
const broadcast = (message) => sockets.forEach((socket) => write(socket, message));

const queryChainLengthMsg = () => ({'type': MessageType.QUERY_LATEST, 'data': null});

const queryAllMsg = () => ({'type': MessageType.QUERY_ALL, 'data': null});

const responseChainMsg = () => ({
	'type': MessageType.RESPONSE_BLOCKCHAIN, 'data': JSON.stringify(getBlockchain())
});

const responseLatestMsg = () => ({
	'type': MessageType.RESPONSE_BLOCKCHAIN,
	'data': JSON.stringify([getLatestBlock()])
});

const initErrorHandler = (ws) => {
	const closeConnection = (myWs) => {
		console.log('connection failed to peer: ' + myWs.url);
		sockets.splice(sockets.indexOf(myWs), 1);
	};

	ws.on('close', () => closeConnection(ws));
	ws.on('error', () => closeConnection(ws));
};

const handleBlockchainResponse = (receivedBlocks) => {
	if (receivedBlocks.length === 0) {
		console.log('received block chain size of 0');
		return;
	}

	const latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];

	if (!isValidBlockStructure(latestBlockReceived)) {
		console.log('block structuture not valid');
		return;
	}

	const latestBlockHeld = getLatestBlock();

	if (latestBlockReceived.index > latestBlockHeld.index) {
		console.log('blockchain possibly behind. We got: ' + latestBlockHeld.index + ' Peer got: ' + latestBlockReceived.index);

		if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
			if (addBlockToChain(latestBlockReceived)) {
				broadcast(responseLatestMsg());
			}
		} else if (receivedBlocks.length === 1) {
			console.log('We have to query the chain from our peer');
			broadcast(queryAllMsg());
		} else {
			console.log('Received blockchain is longer than current blockchain');
			replaceChain(receivedBlocks);
		}
	} else {
		console.log('received blockchain is not longer than received blockchain. Do nothing');
	}
};

const broadcastLatest = () => {
	broadcast(responseLatestMsg());
};

const connectToPeers = (newPeer) => {
	const ws = new WebSocket(newPeer);

	ws.on('open', () => {
		initConnection(ws);
	});

	ws.on('error', () => {
		console.log('connection failed');
	});
};

export { connectToPeers, broadcastLatest, initP2PServer, getSockets };
