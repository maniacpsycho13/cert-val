
import { useEffect, useState } from 'react';
import { Program } from '@coral-xyz/anchor';
import BloomFilterManager, { BloomFilter } from '@/actions/bloomFilter';
import crypto from 'crypto';

interface UseBloomFilterReturn {
  bloomFilter: BloomFilter;
  isLoading: boolean;
  isSynced: boolean;
  syncBloomFilter: () => Promise<void>;
  checkCertificate: (certData: string) => boolean;
  addCertificate: (certData: string) => void;
  stats: {
    size: number;
    numHashFunctions: number;
    bitsSet: number;
    fillRate: number;
  } | null;
}

export function useBloomFilter(
  certificateProgram: Program | null
): UseBloomFilterReturn {
  const [bloomFilter] = useState(() => BloomFilterManager.getInstance());
  const [isLoading, setIsLoading] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [stats, setStats] = useState(bloomFilter.getStats());

  /**
   * Sync Bloom Filter with blockchain certificates
   * This fetches all certificates and populates the Bloom Filter
   */
  const syncBloomFilter = async () => {
    if (!certificateProgram) {
      console.warn('Certificate program not initialized');
      return;
    }

    setIsLoading(true);
    try {
      console.log('Syncing Bloom Filter with blockchain...');
      
      // Clear existing filter
      bloomFilter.clear();

      // Fetch all certificate accounts from the blockchain
      const certificates = await certificateProgram.account.certificate.all();
      
      console.log(`Found ${certificates.length} certificates`);

      // Add each certificate hash to the Bloom Filter
      certificates.forEach((cert) => {
        const certHash = cert.account.certificateHash;
        bloomFilter.add(new Uint8Array(certHash));
      });

      // Save to localStorage
      bloomFilter.save();
      
      setIsSynced(true);
      setStats(bloomFilter.getStats());
      
      console.log('Bloom Filter synced successfully', bloomFilter.getStats());
    } catch (error) {
      console.error('Failed to sync Bloom Filter:', error);
      setIsSynced(false);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Check if a certificate might exist (using Bloom Filter first)
   * Returns true if certificate might exist, false if definitely doesn't exist
   */
  const checkCertificate = (certData: string): boolean => {
    const hash = crypto.createHash('sha256').update(certData).digest();
    const hashArray = new Uint8Array(hash);
    return bloomFilter.contains(hashArray);
  };

  /**
   * Add a certificate to the Bloom Filter
   * Called after successfully issuing a certificate on-chain
   */
  const addCertificate = (certData: string) => {
    const hash = crypto.createHash('sha256').update(certData).digest();
    const hashArray = new Uint8Array(hash);
    bloomFilter.add(hashArray);
    bloomFilter.save();
    setStats(bloomFilter.getStats());
  };

  // Auto-sync on mount if not synced recently
  useEffect(() => {
    const checkSync = () => {
      const lastSync = localStorage.getItem('bloomFilterTimestamp');
      if (!lastSync) {
        return false;
      }

      const lastSyncTime = parseInt(lastSync, 10);
      const hoursSinceSync = (Date.now() - lastSyncTime) / (1000 * 60 * 60);
      
      // Re-sync if more than 24 hours old
      return hoursSinceSync < 24;
    };

    if (certificateProgram && !checkSync()) {
      syncBloomFilter();
    } else if (certificateProgram) {
      setIsSynced(true);
      setStats(bloomFilter.getStats());
    }
  }, [certificateProgram]);

  return {
    bloomFilter,
    isLoading,
    isSynced,
    syncBloomFilter,
    checkCertificate,
    addCertificate,
    stats,
  };
}