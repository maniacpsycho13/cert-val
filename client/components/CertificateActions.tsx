'use client';
import React, { useState, useEffect } from 'react';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { useAnchorWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { AlertCircle, CheckCircle, Upload, Search, FileText, Shield, Plus, Edit, Loader2 } from 'lucide-react';
import { useAnchorPrograms } from '@/lib/useAnchorProgram';
import crypto from 'crypto';

const CertificateSystemApp = () => {
  const wallet = useAnchorWallet();
  const programs = useAnchorPrograms();
  
  const [activeTab, setActiveTab] = useState('issue');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isRegistered, setIsRegistered] = useState(false);

  // Form states
  const [certificateData, setCertificateData] = useState('');
  const [verifyHash, setVerifyHash] = useState('');
  const [oldCertData, setOldCertData] = useState('');
  const [newCertData, setNewCertData] = useState('');
  const [verificationResult, setVerificationResult] = useState(null);

  useEffect(() => {
    if (wallet && programs) {
      checkRegistration();
    }
  }, [wallet, programs]);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  const createCertificateHash = (data) => {
    const hash = crypto.createHash('sha256').update(data).digest();
    return Array.from(hash);
  };

  const checkRegistration = async () => {
    try {
      const [instituteRegistryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('institute_registry')],
        programs.validatorProgram.programId
      );

      const registry = await programs.validatorProgram.account.instituteRegistry.fetch(
        instituteRegistryPda
      );


      console.log("registry",registry);
      

      const registered = registry.registeredInstitutes.some(
        (key) => key.toBase58() === wallet.publicKey.toBase58()
      );

      setIsRegistered(registered);
    } catch (err) {
      console.error('Error checking registration:', err);
      setIsRegistered(false);
    }
  };

  const issueCertificate = async () => {
    if (!certificateData.trim()) {
      showMessage('error', 'Please enter certificate data');
      return;
    }

    if (!isRegistered) {
      showMessage('error', 'Your wallet is not a registered institute');
      return;
    }

    setLoading(true);
    try {
      const certHash = createCertificateHash(certificateData);
      const certHashArray = new Uint8Array(certHash);

      const [certificatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from('certificate'), Buffer.from(certHashArray)],
        programs.certificateProgram.programId
      );

      const [instituteRegistryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('institute_registry')],
        programs.validatorProgram.programId
      );

      await programs.certificateProgram.methods
        .addCertificate(Array.from(certHashArray))
        .accounts({
          certificate: certificatePda,
          issuer: wallet.publicKey,
          instituteRegistry: instituteRegistryPda,
          instituteValidatorProgram: programs.validatorProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      showMessage('success', 'Certificate issued successfully!');
      setCertificateData('');
    } catch (err) {
      console.error('Error issuing certificate:', err);
      showMessage('error', 'Failed to issue certificate: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyCertificate = async () => {
    if (!verifyHash.trim()) {
      showMessage('error', 'Please enter certificate data to verify');
      return;
    }

    setLoading(true);
    try {
      const certHash = createCertificateHash(verifyHash);
      const certHashArray = new Uint8Array(certHash);

      const [certificatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from('certificate'), Buffer.from(certHashArray)],
        programs.certificateProgram.programId
      );

      const status = await programs.certificateProgram.methods
        .verifyCertificate()
        .accounts({
          certificate: certificatePda,
        })
        .view();

      setVerificationResult(status);
      showMessage('success', 'Certificate verified successfully!');
    } catch (err) {
      console.error('Error verifying certificate:', err);
      showMessage('error', 'Certificate not found or verification failed');
      setVerificationResult(null);
    } finally {
      setLoading(false);
    }
  };

  const correctCertificate = async () => {
    if (!oldCertData.trim() || !newCertData.trim()) {
      showMessage('error', 'Please enter both old and new certificate data');
      return;
    }

    if (!isRegistered) {
      showMessage('error', 'Your wallet is not a registered institute');
      return;
    }

    setLoading(true);
    try {
      const oldCertHash = createCertificateHash(oldCertData);
      const newCertHash = createCertificateHash(newCertData);
      const oldCertHashArray = new Uint8Array(oldCertHash);
      const newCertHashArray = new Uint8Array(newCertHash);

      const [oldCertPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('certificate'), Buffer.from(oldCertHashArray)],
        programs.certificateProgram.programId
      );

      const [newCertPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('certificate'), Buffer.from(newCertHashArray)],
        programs.certificateProgram.programId
      );

      const [instituteRegistryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('institute_registry')],
        programs.validatorProgram.programId
      );

      await programs.certificateProgram.methods
        .correctCertificate(Array.from(oldCertHashArray), Array.from(newCertHashArray))
        .accounts({
          oldCertificatePda: oldCertPda,
          newCertificate: newCertPda,
          issuer: wallet.publicKey,
          instituteRegistry: instituteRegistryPda,
          instituteValidatorProgram: programs.validatorProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      showMessage('success', 'Certificate corrected successfully!');
      setOldCertData('');
      setNewCertData('');
    } catch (err) {
      console.error('Error correcting certificate:', err);
      showMessage('error', 'Failed to correct certificate: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'issue', label: 'Issue Certificate', icon: Plus },
    { id: 'verify', label: 'Verify Certificate', icon: Search },
    { id: 'correct', label: 'Correct Certificate', icon: Edit },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <Shield className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Certificate System</h1>
                <p className="text-sm text-gray-500">Blockchain-powered verification</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {wallet && (
                <div className="flex items-center space-x-2 px-4 py-2 bg-gray-100 rounded-lg">
                  <div className={`w-2 h-2 rounded-full ${isRegistered ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="text-sm font-medium text-gray-700">
                    {isRegistered ? 'Registered Institute' : 'Not Registered'}
                  </span>
                </div>
              )}
              <WalletMultiButton className="!bg-blue-600 hover:!bg-blue-700 !rounded-lg" />
            </div>
          </div>
        </div>
      </header>

      {/* Message Alert */}
      {message.text && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
          <div className={`flex items-center p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 
            'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {message.type === 'success' ? 
              <CheckCircle className="w-5 h-5 mr-3" /> : 
              <AlertCircle className="w-5 h-5 mr-3" />
            }
            <span className="font-medium">{message.text}</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!wallet ? (
          <div className="text-center py-20">
            <Shield className="w-20 h-20 text-gray-400 mx-auto mb-4" />
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Welcome to Certificate System</h2>
            <p className="text-gray-600 mb-8">Connect your wallet to get started</p>
            <WalletMultiButton className="!bg-blue-600 hover:!bg-blue-700 !rounded-lg !text-lg !px-8 !py-4" />
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex space-x-2 mb-6 border-b border-gray-200">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center space-x-2 px-6 py-3 font-medium transition-colors border-b-2 ${
                      activeTab === tab.id
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Tab Content */}
            <div className="bg-white rounded-xl shadow-lg p-8">
              {activeTab === 'issue' && (
                <div>
                  <div className="flex items-center space-x-3 mb-6">
                    <FileText className="w-6 h-6 text-blue-600" />
                    <h2 className="text-2xl font-bold text-gray-900">Issue New Certificate</h2>
                  </div>
                  <p className="text-gray-600 mb-6">
                    Enter the certificate data to create a new certificate on the blockchain.
                  </p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Certificate Data
                      </label>
                      <textarea
                        value={certificateData}
                        onChange={(e) => setCertificateData(e.target.value)}
                        placeholder="e.g., Student Name: John Doe, Course: Blockchain Development, Date: 2025-10-28"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        rows={6}
                      />
                    </div>
                    <button
                      onClick={issueCertificate}
                      disabled={loading || !isRegistered}
                      className="flex items-center justify-center space-x-2 w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Processing...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-5 h-5" />
                          <span>Issue Certificate</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'verify' && (
                <div>
                  <div className="flex items-center space-x-3 mb-6">
                    <Search className="w-6 h-6 text-blue-600" />
                    <h2 className="text-2xl font-bold text-gray-900">Verify Certificate</h2>
                  </div>
                  <p className="text-gray-600 mb-6">
                    Enter the original certificate data to verify its authenticity and status.
                  </p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Certificate Data
                      </label>
                      <textarea
                        value={verifyHash}
                        onChange={(e) => setVerifyHash(e.target.value)}
                        placeholder="Enter the exact certificate data to verify"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        rows={6}
                      />
                    </div>
                    <button
                      onClick={verifyCertificate}
                      disabled={loading}
                      className="flex items-center justify-center space-x-2 w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Verifying...</span>
                        </>
                      ) : (
                        <>
                          <Search className="w-5 h-5" />
                          <span>Verify Certificate</span>
                        </>
                      )}
                    </button>

                    {verificationResult && (
                      <div className={`mt-6 p-6 rounded-lg border-2 ${
                        verificationResult.isValid 
                          ? 'bg-green-50 border-green-300' 
                          : 'bg-red-50 border-red-300'
                      }`}>
                        <div className="flex items-center space-x-3 mb-4">
                          {verificationResult.isValid ? (
                            <CheckCircle className="w-8 h-8 text-green-600" />
                          ) : (
                            <AlertCircle className="w-8 h-8 text-red-600" />
                          )}
                          <h3 className={`text-xl font-bold ${
                            verificationResult.isValid ? 'text-green-900' : 'text-red-900'
                          }`}>
                            {verificationResult.isValid ? 'Valid Certificate' : 'Invalid Certificate'}
                          </h3>
                        </div>
                        <div className="space-y-2 text-sm">
                          <p className="text-gray-700">
                            <span className="font-semibold">Issuer:</span> {verificationResult.issuer.toBase58()}
                          </p>
                          {verificationResult.correctedAt && (
                            <p className="text-gray-700">
                              <span className="font-semibold">Corrected At:</span> {new Date(verificationResult.correctedAt.toNumber() * 1000).toLocaleString()}
                            </p>
                          )}
                          {verificationResult.replacementHash && (
                            <p className="text-gray-700">
                              <span className="font-semibold">Status:</span> This certificate has been replaced
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'correct' && (
                <div>
                  <div className="flex items-center space-x-3 mb-6">
                    <Edit className="w-6 h-6 text-blue-600" />
                    <h2 className="text-2xl font-bold text-gray-900">Correct Certificate</h2>
                  </div>
                  <p className="text-gray-600 mb-6">
                    Replace an existing certificate with a corrected version. The old certificate will be marked as invalid.
                  </p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Old Certificate Data
                      </label>
                      <textarea
                        value={oldCertData}
                        onChange={(e) => setOldCertData(e.target.value)}
                        placeholder="Enter the original certificate data"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        rows={4}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        New Certificate Data
                      </label>
                      <textarea
                        value={newCertData}
                        onChange={(e) => setNewCertData(e.target.value)}
                        placeholder="Enter the corrected certificate data"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        rows={4}
                      />
                    </div>
                    <button
                      onClick={correctCertificate}
                      disabled={loading || !isRegistered}
                      className="flex items-center justify-center space-x-2 w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Processing...</span>
                        </>
                      ) : (
                        <>
                          <Edit className="w-5 h-5" />
                          <span>Correct Certificate</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default CertificateSystemApp;