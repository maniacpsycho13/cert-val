"use client";
/**
 * Client-side Bloom Filter for Certificate Verification
 * Based on the research paper's optimization approach
 * Size: 1 MB = 8,388,608 bits
 */

const FILTER_SIZE = 8388608; // 1 MB in bits
const NUM_HASH_FUNCTIONS = 3;

export class BloomFilter {
  private bitArray: Uint8Array;
  private size: number;
  private numHashFunctions: number;

  constructor() {
    // 8,388,608 bits = 1,048,576 bytes = 1 MB
    this.bitArray = new Uint8Array(FILTER_SIZE / 8);
    this.size = FILTER_SIZE;
    this.numHashFunctions = NUM_HASH_FUNCTIONS;
  }

  /**
   * Add a certificate hash to the Bloom Filter
   */
  add(certHash: Uint8Array | string): void {
    const hash = typeof certHash === 'string' 
      ? this.stringToUint8Array(certHash) 
      : certHash;

    for (let i = 0; i < this.numHashFunctions; i++) {
      const index = this.getIndex(hash, i);
      const byteIndex = Math.floor(index / 8);
      const bitIndex = index % 8;
      this.bitArray[byteIndex] |= (1 << bitIndex);
    }
  }

  /**
   * Check if a certificate hash might exist
   * Returns: true if possibly exists (may have false positives)
   *          false if definitely does not exist (no false negatives)
   */
  contains(certHash: Uint8Array | string): boolean {
    const hash = typeof certHash === 'string' 
      ? this.stringToUint8Array(certHash) 
      : certHash;

    for (let i = 0; i < this.numHashFunctions; i++) {
      const index = this.getIndex(hash, i);
      const byteIndex = Math.floor(index / 8);
      const bitIndex = index % 8;
      
      if ((this.bitArray[byteIndex] & (1 << bitIndex)) === 0) {
        return false; // Definitely not in the set
      }
    }
    return true; // Possibly in the set
  }

  /**
   * Calculate bit index using hash function
   */
  private getIndex(certHash: Uint8Array, hashNum: number): number {
    // Create different hash values by combining certHash with hashNum
    const combined = new Uint8Array(certHash.length + 1);
    combined.set(certHash);
    combined[certHash.length] = hashNum;

    // Simple hash function (in production, use crypto.subtle for better distribution)
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      hash = ((hash << 5) - hash) + combined[i];
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash) % this.size;
  }

  /**
   * Convert string to Uint8Array
   */
  private stringToUint8Array(str: string): Uint8Array {
    const encoder = new TextEncoder();
    return encoder.encode(str);
  }

  /**
   * Serialize Bloom Filter to localStorage
   */
  save(): void {
    try {
      const serialized = Array.from(this.bitArray);
      localStorage.setItem('certificateBloomFilter', JSON.stringify(serialized));
      localStorage.setItem('bloomFilterTimestamp', Date.now().toString());
    } catch (error) {
      console.error('Failed to save Bloom Filter:', error);
    }
  }

  /**
   * Deserialize Bloom Filter from localStorage
   */
  load(): boolean {
    try {
      const stored = localStorage.getItem('certificateBloomFilter');
      if (!stored) return false;

      const serialized = JSON.parse(stored);
      this.bitArray = new Uint8Array(serialized);
      return true;
    } catch (error) {
      console.error('Failed to load Bloom Filter:', error);
      return false;
    }
  }

  /**
   * Clear the Bloom Filter
   */
  clear(): void {
    this.bitArray = new Uint8Array(FILTER_SIZE / 8);
    localStorage.removeItem('certificateBloomFilter');
    localStorage.removeItem('bloomFilterTimestamp');
  }

  /**
   * Get approximate false positive rate
   */
  getFalsePositiveRate(numElements: number): number {
    if (numElements === 0) return 0;
    
    // FPR ≈ (1 - e^(-k*n/m))^k
    const k = this.numHashFunctions;
    const n = numElements;
    const m = this.size;
    
    const exponent = (-k * n) / m;
    const fpr = Math.pow(1 - Math.exp(exponent), k);
    
    return fpr * 100; // Return as percentage
  }

  /**
   * Get statistics about the Bloom Filter
   */
  getStats(): {
    size: number;
    numHashFunctions: number;
    bitsSet: number;
    fillRate: number;
  } {
    let bitsSet = 0;
    for (let i = 0; i < this.bitArray.length; i++) {
      // Count set bits using Brian Kernighan's algorithm
      let byte = this.bitArray[i];
      while (byte) {
        byte &= byte - 1;
        bitsSet++;
      }
    }

    return {
      size: this.size,
      numHashFunctions: this.numHashFunctions,
      bitsSet,
      fillRate: (bitsSet / this.size) * 100,
    };
  }
}

/**
 * Singleton instance manager
 */
class BloomFilterManager {
  private static instance: BloomFilter | null = null;

  static getInstance(): BloomFilter {
    if (!this.instance) {
      this.instance = new BloomFilter();
      this.instance.load(); // Try to load from localStorage
    }
    return this.instance;
  }

  static reset(): void {
    this.instance = new BloomFilter();
  }
}

export default BloomFilterManager;