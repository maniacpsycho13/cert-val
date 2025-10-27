'use client';

import React, { useState, useEffect } from 'react';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { useAnchorWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { AlertCircle, CheckCircle, Upload, Search, FileText, Shield, Plus, Edit, Loader2, Users, Vote, UserPlus } from 'lucide-react';
import { useAnchorPrograms } from '@/lib/useAnchorProgram';
import crypto from 'crypto';

const CertificateSystemApp = () => {
  const wallet = useAnchorWallet();
  const programs = useAnchorPrograms();
  
  const [activeTab, setActiveTab] = useState('status');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isRegistered, setIsRegistered] = useState(false);
  const [registryExists, setRegistryExists] = useState(false);
  const [registryInfo, setRegistryInfo] = useState(null);

  // Form states
  const [certificateData, setCertificateData] = useState('');
  const [verifyHash, setVerifyHash] = useState('');
  const [oldCertData, setOldCertData] = useState('');
  const [newCertData, setNewCertData] = useState('');
  const [verificationResult, setVerificationResult] = useState(null);
  const [candidateAddress, setCandidateAddress] = useState('');
  const [initialInstitutes, setInitialInstitutes] = useState(['', '', '']);
  const [votingStateInfo, setVotingStateInfo] = useState(null);

  useEffect(() => {
    if (wallet && programs) {
      checkRegistry();
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

  const checkRegistry = async () => {
    try {
      const [instituteRegistryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('institute_registry')],
        programs.validatorProgram.programId
      );

      const registry = await programs.validatorProgram.account.instituteRegistry.fetch(
        instituteRegistryPda
      );

      setRegistryExists(true);
      setRegistryInfo({
        authority: registry.authority.toBase58(),
        institutes: registry.registeredInstitutes,
        count: registry.registeredInstitutes.length
      });

      const registered = registry.registeredInstitutes.some(
        (key) => key.toBase58() === wallet.publicKey.toBase58()
      );

      setIsRegistered(registered);
    } catch (err) {
      console.log('Registry not initialized yet');
      setRegistryExists(false);
      setIsRegistered(false);
    }
  };

  const initializeRegistry = async () => {
    const validAddresses = initialInstitutes.filter(addr => {
      try {
        new PublicKey(addr);
        return true;
      } catch {
        return false;
      }
    });

    if (validAddresses.length === 0) {
      showMessage('error', 'Please enter at least one valid institute address');
      return;
    }

    setLoading(true);
    try {
      const [instituteRegistryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('institute_registry')],
        programs.validatorProgram.programId
      );

      const institutePubkeys = validAddresses.map(addr => new PublicKey(addr));

      await programs.validatorProgram.methods
        .initializeRegistry(institutePubkeys)
        .accounts({
          instituteRegistry: instituteRegistryPda,
          authority: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      showMessage('success', 'Registry initialized successfully!');
      await checkRegistry();
      setInitialInstitutes(['', '', '']);
    } catch (err) {
      console.error('Error initializing registry:', err);
      showMessage('error', 'Failed to initialize registry: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const proposeNewInstitute = async () => {
    if (!candidateAddress.trim()) {
      showMessage('error', 'Please enter a candidate address');
      return;
    }

    let candidatePubkey;
    try {
      candidatePubkey = new PublicKey(candidateAddress);
    } catch {
      showMessage('error', 'Invalid public key address');
      return;
    }

    setLoading(true);
    try {
      const [votingStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from('voting_state'), candidatePubkey.toBuffer()],
        programs.validatorProgram.programId
      );

      const [instituteRegistryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('institute_registry')],
        programs.validatorProgram.programId
      );

      await programs.validatorProgram.methods
        .newInstituteElection(candidatePubkey)
        .accounts({
          votingState: votingStatePda,
          instituteRegistry: instituteRegistryPda,
          proposer: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      showMessage('success', 'Election created successfully!');
      setCandidateAddress('');
    } catch (err) {
      console.error('Error creating election:', err);
      showMessage('error', 'Failed to create election: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const voteOnCandidate = async (candidateAddr, voteFor) => {
    setLoading(true);
    try {
      const candidatePubkey = new PublicKey(candidateAddr);
      
      const [votingStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from('voting_state'), candidatePubkey.toBuffer()],
        programs.validatorProgram.programId
      );

      const [instituteRegistryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('institute_registry')],
        programs.validatorProgram.programId
      );

      await programs.validatorProgram.methods
        .vote(voteFor)
        .accounts({
          votingState: votingStatePda,
          instituteRegistry: instituteRegistryPda,
          voter: wallet.publicKey,
        })
        .rpc();

      showMessage('success', `Vote ${voteFor ? 'for' : 'against'} recorded successfully!`);
      await checkRegistry();
      await checkVotingStatus(candidateAddr);
    } catch (err) {
      console.error('Error voting:', err);
      showMessage('error', 'Failed to vote: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const checkVotingStatus = async (candidateAddr) => {
    if (!candidateAddr) return;
    
    try {
      const candidatePubkey = new PublicKey(candidateAddr);
      
      const [votingStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from('voting_state'), candidatePubkey.toBuffer()],
        programs.validatorProgram.programId
      );

      const votingState = await programs.validatorProgram.account.votingState.fetch(
        votingStatePda
      );

      setVotingStateInfo({
        candidate: votingState.candidateInstitute.toBase58(),
        votesFor: votingState.votesFor.length,
        votesAgainst: votingState.votesAgainst.length,
        totalEligible: votingState.totalEligibleVoters,
        status: votingState.status,
        hasVoted: votingState.votesFor.some(v => v.toBase58() === wallet.publicKey.toBase58()) ||
                  votingState.votesAgainst.some(v => v.toBase58() === wallet.publicKey.toBase58())
      });
    } catch (err) {
      console.error('Error fetching voting state:', err);
      setVotingStateInfo(null);
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
    { id: 'status', label: 'System Status', icon: Shield },
    { id: 'init', label: 'Initialize Registry', icon: Users },
    { id: 'propose', label: 'Propose Institute', icon: UserPlus },
    { id: 'vote', label: 'Vote', icon: Vote },
    { id: 'issue', label: 'Issue Certificate', icon: Plus },
    { id: 'verify', label: 'Verify Certificate', icon: Search },
    { id: 'correct', label: 'Correct Certificate', icon: Edit },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
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
                  <div className={`w-2 h-2 rounded-full ${isRegistered ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
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
            <div className="flex space-x-2 mb-6 border-b border-gray-200 overflow-x-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center space-x-2 px-4 py-3 font-medium transition-colors border-b-2 whitespace-nowrap ${
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

            <div className="bg-white rounded-xl shadow-lg p-8">
              {activeTab === 'status' && (
                <div>
                  <div className="flex items-center space-x-3 mb-6">
                    <Shield className="w-6 h-6 text-blue-600" />
                    <h2 className="text-2xl font-bold text-gray-900">System Status</h2>
                  </div>
                  
                  {registryExists ? (
                    <div className="space-y-4">
                      <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                        <div className="flex items-center space-x-2 mb-4">
                          <CheckCircle className="w-6 h-6 text-green-600" />
                          <h3 className="text-lg font-semibold text-green-900">Registry Active</h3>
                        </div>
                        <div className="space-y-2 text-sm text-gray-700">
                          <p><span className="font-semibold">Total Institutes:</span> {registryInfo?.count}</p>
                          <p><span className="font-semibold">Authority:</span> {registryInfo?.authority}</p>
                        </div>
                      </div>

                      <div className={`border rounded-lg p-6 ${
                        isRegistered ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
                      }`}>
                        <div className="flex items-center space-x-2 mb-2">
                          {isRegistered ? (
                            <CheckCircle className="w-6 h-6 text-green-600" />
                          ) : (
                            <AlertCircle className="w-6 h-6 text-yellow-600" />
                          )}
                          <h3 className={`text-lg font-semibold ${
                            isRegistered ? 'text-green-900' : 'text-yellow-900'
                          }`}>
                            Your Status: {isRegistered ? 'Registered Institute ✓' : 'Not Registered'}
                          </h3>
                        </div>
                        <p className={`text-sm ${isRegistered ? 'text-green-800' : 'text-yellow-800'}`}>
                          {isRegistered 
                            ? 'You can issue certificates, vote on new institutes, and correct certificates.'
                            : 'To become a registered institute, someone needs to propose your wallet address and all existing institutes must vote in favor.'}
                        </p>
                        {!isRegistered && (
                          <div className="mt-4 p-3 bg-white rounded border border-yellow-300">
                            <p className="text-sm font-semibold text-gray-800 mb-2">Your Wallet Address:</p>
                            <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-700 break-all">
                              {wallet.publicKey.toBase58()}
                            </code>
                            <p className="text-xs text-gray-600 mt-2">
                              Share this address with existing institutes to get proposed and voted in.
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="bg-gray-50 rounded-lg p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Registered Institutes</h3>
                        <div className="space-y-2">
                          {registryInfo?.institutes.map((inst, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-white rounded border border-gray-200">
                              <span className="text-sm font-mono text-gray-700">{inst.toBase58()}</span>
                              {inst.toBase58() === wallet.publicKey.toBase58() && (
                                <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">You</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                      <div className="flex items-center space-x-2 mb-2">
                        <AlertCircle className="w-6 h-6 text-yellow-600" />
                        <h3 className="text-lg font-semibold text-yellow-900">Registry Not Initialized</h3>
                      </div>
                      <p className="text-yellow-800 text-sm mb-4">Please initialize the registry first to start using the system.</p>
                      <button
                        onClick={() => setActiveTab('init')}
                        className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm font-medium"
                      >
                        Go to Initialize Registry
                      </button>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'init' && (
                <div>
                  <div className="flex items-center space-x-3 mb-6">
                    <Users className="w-6 h-6 text-blue-600" />
                    <h2 className="text-2xl font-bold text-gray-900">Initialize Registry</h2>
                  </div>
                  {registryExists ? (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                      <p className="text-blue-800">Registry has already been initialized. You cannot initialize it again.</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-gray-600 mb-6">
                        Set up the initial registry with founding institutes. This can only be done once.
                      </p>
                      <div className="space-y-4">
                        {initialInstitutes.map((addr, idx) => (
                          <div key={idx}>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Institute {idx + 1} Public Key
                            </label>
                            <input
                              type="text"
                              value={addr}
                              onChange={(e) => {
                                const newInstitutes = [...initialInstitutes];
                                newInstitutes[idx] = e.target.value;
                                setInitialInstitutes(newInstitutes);
                              }}
                              placeholder="Enter Solana public key"
                              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                            />
                          </div>
                        ))}
                        <button
                          onClick={() => setInitialInstitutes([...initialInstitutes, ''])}
                          className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                        >
                          + Add Another Institute
                        </button>
                        <button
                          onClick={initializeRegistry}
                          disabled={loading}
                          className="flex items-center justify-center space-x-2 w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
                        >
                          {loading ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" />
                              <span>Initializing...</span>
                            </>
                          ) : (
                            <>
                              <Users className="w-5 h-5" />
                              <span>Initialize Registry</span>
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'propose' && (
                <div>
                  <div className="flex items-center space-x-3 mb-6">
                    <UserPlus className="w-6 h-6 text-blue-600" />
                    <h2 className="text-2xl font-bold text-gray-900">Propose New Institute</h2>
                  </div>
                  {!registryExists ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                      <p className="text-yellow-800">Please initialize the registry first.</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-gray-600 mb-6">
                        Create an election to add a new institute. Requires 100% approval from existing institutes.
                      </p>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Candidate Institute Public Key
                          </label>
                          <input
                            type="text"
                            value={candidateAddress}
                            onChange={(e) => setCandidateAddress(e.target.value)}
                            placeholder="Enter Solana public key"
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                          />
                        </div>
                        <button
                          onClick={proposeNewInstitute}
                          disabled={loading}
                          className="flex items-center justify-center space-x-2 w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
                        >
                          {loading ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" />
                              <span>Creating Election...</span>
                            </>
                          ) : (
                            <>
                              <UserPlus className="w-5 h-5" />
                              <span>Create Election</span>
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'vote' && (
                <div>
                  <div className="flex items-center space-x-3 mb-6">
                    <Vote className="w-6 h-6 text-blue-600" />
                    <h2 className="text-2xl font-bold text-gray-900">Vote on Candidates</h2>
                  </div>
                  {!isRegistered ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                      <div className="flex items-center space-x-2 mb-2">
                        <AlertCircle className="w-6 h-6 text-yellow-600" />
                        <h3 className="text-lg font-semibold text-yellow-900">Only Registered Institutes Can Vote</h3>
                      </div>
                      <p className="text-yellow-800 text-sm mb-4">
                        You need to be a registered institute to vote on candidates. Get proposed and approved by existing institutes first.
                      </p>
                      <div className="p-3 bg-white rounded border border-yellow-300">
                        <p className="text-sm font-semibold text-gray-800 mb-2">Your Wallet Address:</p>
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-700 break-all">
                          {wallet.publicKey.toBase58()}
                        </code>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-gray-600 mb-6">
                        Enter the candidate address to check voting status and cast your vote.
                      </p>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Candidate Address
                          </label>
                          <div className="flex space-x-2">
                            <input
                              type="text"
                              value={candidateAddress}
                              onChange={(e) => setCandidateAddress(e.target.value)}
                              placeholder="Enter candidate public key"
                              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                            />
                            <button
                              onClick={() => checkVotingStatus(candidateAddress)}
                              className="px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium"
                            >
                              Check Status
                            </button>
                          </div>
                        </div>

                        {votingStateInfo && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h4 className="font-semibold text-blue-900 mb-3">Voting Status</h4>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div>
                                <span className="text-gray-600">Votes For:</span>
                                <span className="ml-2 font-semibold text-green-700">{votingStateInfo.votesFor}</span>
                              </div>
                              <div>
                                <span className="text-gray-600">Votes Against:</span>
                                <span className="ml-2 font-semibold text-red-700">{votingStateInfo.votesAgainst}</span>
                              </div>
                              <div>
                                <span className="text-gray-600">Total Eligible:</span>
                                <span className="ml-2 font-semibold">{votingStateInfo.totalEligible}</span>
                              </div>
                              <div>
                                <span className="text-gray-600">Status:</span>
                                <span className="ml-2 font-semibold">
                                  {votingStateInfo.status.active ? '🟢 Active' : 
                                   votingStateInfo.status.approved ? '✅ Approved' : '❌ Rejected'}
                                </span>
                              </div>
                            </div>
                            {votingStateInfo.hasVoted && (
                              <div className="mt-3 p-2 bg-white rounded border border-blue-300">
                                <p className="text-sm text-blue-800">✓ You have already voted on this candidate</p>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex space-x-4">
                          <button
                            onClick={() => voteOnCandidate(candidateAddress, true)}
                            disabled={loading || !candidateAddress || (votingStateInfo && votingStateInfo.hasVoted)}
                            className="flex-1 flex items-center justify-center space-x-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
                          >
                            <CheckCircle className="w-5 h-5" />
                            <span>Vote For</span>
                          </button>
                          <button
                            onClick={() => voteOnCandidate(candidateAddress, false)}
                            disabled={loading || !candidateAddress || (votingStateInfo && votingStateInfo.hasVoted)}
                            className="flex-1 flex items-center justify-center space-x-2 bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
                          >
                            <AlertCircle className="w-5 h-5" />
                            <span>Vote Against</span>
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'issue' && (
                <div>
                  <div className="flex items-center space-x-3 mb-6">
                    <FileText className="w-6 h-6 text-blue-600" />
                    <h2 className="text-2xl font-bold text-gray-900">Issue New Certificate</h2>
                  </div>
                  {!isRegistered ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                      <p className="text-yellow-800">Only registered institutes can issue certificates.</p>
                    </div>
                  ) : (
                    <>
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
                          disabled={loading}
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
                    </>
                  )}
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
                  {!isRegistered ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                      <p className="text-yellow-800">Only registered institutes can correct certificates.</p>
                    </div>
                  ) : (
                    <>
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
                          disabled={loading}
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
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-sm text-gray-500">
        <p>Certificate System - Powered by Solana Blockchain</p>
      </footer>
    </div>
  );
};

export default CertificateSystemApp;