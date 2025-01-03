import bs58 from 'bs58';

const privateKeyBase58 = '5rmCSzn4SnKzozc5krLBQZJd5tZzwRB4QNNtZXQbtC9xiWo8wGujoHqpFbjTMPpVEXfJzDAm9jxg52B2YjauDonJ';
const privateKeyArray = Array.from(bs58.decode(privateKeyBase58));
// console.log("test...")
console.log(JSON.stringify(privateKeyArray)); 