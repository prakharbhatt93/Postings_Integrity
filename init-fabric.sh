cd fabric-samples
cd test-network
./network.sh down || true
./network.sh up createChannel -c mychannel -ca
docker pull hyperledger/fabric-nodeenv:2.5
./network.sh deployCC -ccn proposal -ccp ../chaincode/proposal -ccl javascript
