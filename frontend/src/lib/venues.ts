// Generated from contracts/stocks/{base-sepolia,hood-testnet,solana-devnet}.json.
// Used only as a fallback when a meme's contract view does not list a venue.
// Regenerate if the registries change.
export const TESTNET_VENUES: Record<string, {
  name: string;
  refPriceUsd: string;
  base?: { token: string; symbol: string; decimals: number };
  robinhood?: { token: string; symbol: string; decimals: number };
  solana?: { token: string; symbol: string; decimals: number };
}> = {
  "NVDA": {
    "name": "NVIDIA",
    "refPriceUsd": "177.56",
    "base": {
      "token": "0x8f13563130684478E617C1797308A081Cb2c2654",
      "symbol": "NVDAc",
      "decimals": 8
    },
    "robinhood": {
      "token": "0x82289af84B9a0faf598a4D2052E16c8D1619f7f4",
      "symbol": "NVDA",
      "decimals": 18
    },
    "solana": {
      "token": "88Bseqdd57C3sD5E8SaLPfwQ18e47RvzCXsRApiwSqbB",
      "symbol": "NVDAx",
      "decimals": 8
    }
  },
  "AAPL": {
    "name": "Apple",
    "refPriceUsd": "350.44",
    "base": {
      "token": "0xEbF01E9d3d578AD3af778C281E56aDA483ebB9bD",
      "symbol": "AAPLc",
      "decimals": 8
    },
    "robinhood": {
      "token": "0x3ab373732E7bE9fD387e767F0e36040677a14057",
      "symbol": "AAPL",
      "decimals": 18
    },
    "solana": {
      "token": "FtYHpjhYBFVrUE1inx7w48Wp1s7AzxnsFptvpgZcGkW5",
      "symbol": "AAPLx",
      "decimals": 8
    }
  },
  "MSFT": {
    "name": "Microsoft",
    "refPriceUsd": "544.15",
    "base": {
      "token": "0x4fE929688f9A5598bE4559daC9B92a9A05cD2265",
      "symbol": "MSFTc",
      "decimals": 8
    },
    "robinhood": {
      "token": "0x8d26425Ea6B44032938b290Bab5C032CaA747cdD",
      "symbol": "MSFT",
      "decimals": 18
    },
    "solana": {
      "token": "Bah7NyVk64eL7ADuHuJYwqKeG6vQTD5YRPQKLMtzG4SP",
      "symbol": "MSFTx",
      "decimals": 8
    }
  },
  "GOOGL": {
    "name": "Alphabet",
    "refPriceUsd": "290.38",
    "base": {
      "token": "0x12e763e9C1ceeb82f9AaCdf8a87b152bE05A7eeF",
      "symbol": "GOOGLc",
      "decimals": 8
    },
    "robinhood": {
      "token": "0xaf95AE21417c4a1489C7C49990a9C03DD3C6B98C",
      "symbol": "GOOGL",
      "decimals": 18
    },
    "solana": {
      "token": "XLYZw9YeVrUNsp4dAVVYayMdT5jWrmk6wFjUNWu8AnH",
      "symbol": "GOOGLx",
      "decimals": 8
    }
  },
  "AMZN": {
    "name": "Amazon",
    "refPriceUsd": "268.14",
    "base": {
      "token": "0x9b931cb9EE0A70b88d89b3c21687d4a6ccee32a3",
      "symbol": "AMZNc",
      "decimals": 8
    },
    "robinhood": {
      "token": "0x9f555Fa3247304bEd0033EC31c8d6A88c36c6A37",
      "symbol": "AMZN",
      "decimals": 18
    },
    "solana": {
      "token": "D4GVCzUpbJRkqQ4ymbpXxKTC5jCxWK1gRvDXwRAHERZk",
      "symbol": "AMZNx",
      "decimals": 8
    }
  },
  "META": {
    "name": "Meta Platforms",
    "refPriceUsd": "642.58",
    "base": {
      "token": "0x845A964b112a33B6A0881b36e121fdDFFDe2477d",
      "symbol": "METAc",
      "decimals": 8
    },
    "robinhood": {
      "token": "0x4d65dBeD417B42Ecef039aF0931948bC07507D53",
      "symbol": "META",
      "decimals": 18
    },
    "solana": {
      "token": "66aQ8CyXmgYkvreikf76EzETQC4oVgv9bbdxbPgFrKj8",
      "symbol": "METAx",
      "decimals": 8
    }
  },
  "TSLA": {
    "name": "Tesla",
    "refPriceUsd": "376.77",
    "base": {
      "token": "0x431190511D177106Fa49588f7e1Dc3B845c95Bc5",
      "symbol": "TSLAc",
      "decimals": 8
    },
    "robinhood": {
      "token": "0x3D3E8Cf6F9F92b9a1574cdB4C5686261cF52b47B",
      "symbol": "TSLA",
      "decimals": 18
    },
    "solana": {
      "token": "229y3sTgdfFBEWGxmuvQ4yvpj8puVrpmeSFNp7ZRkmSq",
      "symbol": "TSLAx",
      "decimals": 8
    }
  },
  "SPCX": {
    "name": "SpaceX",
    "refPriceUsd": "141.18",
    "base": {
      "token": "0x486FECA986219f7d4eC52Cbf56d9ca14D4955035",
      "symbol": "SPCXc",
      "decimals": 8
    },
    "robinhood": {
      "token": "0xf0c264689aC444FFe95b9F03e8eFF2bA36E508E0",
      "symbol": "SPCX",
      "decimals": 18
    },
    "solana": {
      "token": "8mdbWErQneCkM6jpE5epezYrk8W6uhjjG9nnPwxLQDKp",
      "symbol": "SPCXx",
      "decimals": 8
    }
  }
};
