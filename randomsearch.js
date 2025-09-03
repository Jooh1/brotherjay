const { ethers, utils } = require('ethers');
const fs = require('fs');
const bitcoin = require('bitcoinjs-lib');
const bip39 = require('bip39');
const { BIP32Factory } = require('bip32');
const ecc = require('tiny-secp256k1');
const fetch = require('node-fetch');
const chalk = require('chalk').default;
const readline = require('readline');

// ==============================================
//                  TECH-GOD BANNER
// ==============================================
console.log(chalk.red(`
████████╗███████╗ ██████╗██╗  ██╗ ██████╗  ██████╗ ██████╗ 
╚══██╔══╝██╔════╝██╔════╝██║  ██║██╔════╝ ██╔═══██╗██╔══██╗
   ██║   █████╗  ██║     ███████║██║  ███╗██║   ██║██║  ██║
   ██║   ██╔══╝  ██║     ██╔══██║██║   ██║██║   ██║██║  ██║
   ██║   ███████╗╚██████╗██║  ██║╚██████╔╝╚██████╔╝██████╔╝
   ╚═╝   ╚══════╝ ╚═════╝╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═════╝ 
`));
console.log(chalk.blue('⚡ RANDOM PROVIDER WALLET SCANNER ⚡\n'));

// Initialize BIP32 with secp256k1
const bip32 = BIP32Factory(ecc);

// Global stats
const stats = {
  totalMnemonics: 0,
  totalAddresses: 0,
  walletsFound: 0,
  startTime: Date.now(),
  lastFound: null
};

// Provider configuration
const providers = {
  bsc: [
    'https://bsc-dataseed1.defibit.io/',
    'https://bsc-dataseed1.ninicoin.io',
    'https://bsc.publicnode.com'
  ],
  bitcoin: 'https://blockstream.info/api/'
};

// =====================
// PROGRESS DISPLAY
// =====================

function updateProgress() {
  readline.cursorTo(process.stdout, 0);
  const elapsed = Math.floor((Date.now() - stats.startTime) / 1000);
  const hours = Math.floor(elapsed / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
  const seconds = (elapsed % 60).toString().padStart(2, '0');

  process.stdout.write(chalk.yellow(
    `⏱️  ${hours}:${minutes}:${seconds} | ` +
    `🌱 ${stats.totalMnemonics} mnemonics | ` +
    `🔍 ${stats.totalAddresses} addresses | ` +
    `💰 ${stats.walletsFound} found` +
    (stats.lastFound ? ` | Last: ${stats.lastFound}` : '') +
    ' '.repeat(20) // Clear any leftover text
  ));
}

// =====================
// CORE FUNCTIONS
// =====================

function generateRandomMnemonic() {
  const entropy = ethers.utils.randomBytes(16);
  return ethers.utils.entropyToMnemonic(entropy);
}

function getBitcoinAddress(mnemonic, path, network = bitcoin.networks.bitcoin) {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed, network);
  const child = root.derivePath(path);
  return bitcoin.payments.p2pkh({ pubkey: child.publicKey, network }).address;
}

async function getBitcoinBalance(address) {
  try {
    const response = await fetch(`${providers.bitcoin}/address/${address}`);
    if (!response.ok) return 0;
    const data = await response.json();
    return (data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum) / 100000000;
  } catch (error) {
    return 0;
  }
}

async function getRandomBscProvider() {
  const randomIndex = Math.floor(Math.random() * providers.bsc.length);
  const endpoint = providers.bsc[randomIndex];
  try {
    const provider = new ethers.providers.JsonRpcProvider(endpoint);
    await provider.getBlockNumber();
    return provider;
  } catch (error) {
    console.log(chalk.yellow(`\n⚠️ Failed to connect to ${endpoint}, trying another...`));
    return getRandomBscProvider();
  }
}

// =====================
// SCANNING LOGIC
// =====================

async function scanWallet() {
  try {
    const provider = await getRandomBscProvider();
    const mnemonic = generateRandomMnemonic();
    stats.totalMnemonics++;

    const hdNode = utils.HDNode.fromMnemonic(mnemonic);
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const btcRoot = bip32.fromSeed(seed, bitcoin.networks.bitcoin);

    for (let i = 0; i < 10; i++) {
      stats.totalAddresses++;
      updateProgress();

      try {
        // BSC Wallet
        const bscWallet = hdNode.derivePath(`m/44'/60'/0'/0/${i}`);
        const bscBalance = await provider.getBalance(bscWallet.address)
          .then(b => ethers.utils.formatEther(b))
          .catch(() => '0.0');

        // Bitcoin Wallet
        const btcPath = `m/44'/0'/0'/0/${i}`;
        const btcAddress = getBitcoinAddress(mnemonic, btcPath);
        const btcBalance = await getBitcoinBalance(btcAddress);
        const btcChild = btcRoot.derivePath(btcPath);
        const btcPrivateKey = btcChild.toWIF();

        if (parseFloat(bscBalance) > 0 || parseFloat(btcBalance) > 0) {
          stats.walletsFound++;
          stats.lastFound = new Date().toLocaleTimeString();
          
          const result = `\n\n💰 WALLET FOUND 💰
Timestamp: ${new Date().toISOString()}
Mnemonic: ${mnemonic}
Index: ${i}

BSC Address: ${bscWallet.address}
Balance: ${bscBalance} BNB
Private Key: ${bscWallet.privateKey}

BTC Address: ${btcAddress}
Balance: ${btcBalance} BTC
Private Key: ${btcPrivateKey}
------------------------\n`;
          
          console.log(chalk.green.bold(result));
          fs.appendFileSync('found_wallets.txt', result);
          updateProgress();
        }
      } catch (error) {
        console.log(chalk.red(`\nError scanning index ${i}: ${error.message}`));
      }
    }
  } catch (error) {
    console.log(chalk.red.bold('\n❌ Scan Error:'), error.message);
  }
}

// =====================
// MAIN EXECUTION
// =====================

async function main() {
  console.log(chalk.yellow('Starting continuous scan... (CTRL+C to stop)\n'));
  console.log(chalk.gray('Live stats will appear here:\n'));

  // Initial progress display
  updateProgress();

  // Start continuous scanning
  while (true) {
    await scanWallet();
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

// Clean exit handler
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\n🛑 Scan stopped by user'));
  console.log(chalk.yellow('Final stats:'));
  updateProgress();
  console.log('\n');
  process.exit(0);
});

main().catch(err => {
  console.log(chalk.red.bold('\n❌ Fatal Error:'), err.message);
  process.exit(1);
});
