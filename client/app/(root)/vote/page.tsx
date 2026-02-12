'use client';

export const dynamic = 'force-dynamic'
import React, { useState, useEffect } from 'react';
import { Vote, Users, UserPlus, CheckCircle, XCircle, Shield, AlertTriangle, Loader2, TrendingUp, Clock, Award } from 'lucide-react';
import { useAnchorWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { useAnchorPrograms } from '@/lib/useAnchorProgram';

const VotingPortal = () => {
  const wallet = useAnchorWallet();
  const programs = useAnchorPrograms();
  
  const [activeTab, setActiveTab] = useState('elections'); // 'elections', 'propose', 'institutes'
  const [isRegistered, setIsRegistered] = useState(false);
  const [registryInfo, setRegistryInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  // Propose form
  const [candidateAddress, setCandidateAddress] = useState('');
  
  // Active elections
  const [activeElections, setActiveElections] = useState([]);
  const [loadingElections, setLoadingElections] = useState(false);
  
  // Voting
  const [votingOnCandidate, setVotingOnCandidate] = useState(null);

  useEffect(() => {
    if (wallet && programs) {
      checkRegistry();
    }
  }, [wallet, programs]);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  const checkRegistry = async () => {
    try {
      const [registryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('institute_registry')],
        programs.validatorProgram.programId
      );
      
      const registry = await programs.validatorProgram.account.instituteRegistry.fetch(registryPda);
      
      setRegistryInfo({
        authority: registry.authority.toBase58(),
        institutes: registry.registeredInstitutes,
        count: registry.registeredInstitutes.length
      });
      
      const registered = registry.registeredInstitutes.some(
        key => key.toBase58() === wallet.publicKey.toBase58()
      );
      
      setIsRegistered(registered);
    } catch (err) {
      console.error('Registry check error:', err);
      setIsRegistered(false);
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
      showMessage('error', 'Invalid Solana address');
      return;
    }

    setLoading(true);
    try {
      const [votingStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from('voting_state'), candidatePubkey.toBuffer()],
        programs.validatorProgram.programId
      );

      const [registryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('institute_registry')],
        programs.validatorProgram.programId
      );

      await programs.validatorProgram.methods
        .newInstituteElection(candidatePubkey)
        .accounts({
          votingState: votingStatePda,
          instituteRegistry: registryPda,
          proposer: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      showMessage('success', 'Election created successfully! Institutes can now vote.');
      setCandidateAddress('');
      await loadActiveElections();
    } catch (err) {
      console.error('Propose error:', err);
      if (err.toString().includes('InstituteAlreadyRegistered')) {
        showMessage('error', 'This institute is already registered');
      } else {
        showMessage('error', 'Failed to create election: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadActiveElections = async () => {
    if (!programs || !registryInfo) return;
    
    setLoadingElections(true);
    const elections = [];
    
    // This is a simplified approach - in production you'd query all voting state accounts
    // For now, we'll just show message to check specific addresses
    setLoadingElections(false);
  };

  const checkVotingState = async (candidateAddr) => {
    try {
      const candidatePubkey = new PublicKey(candidateAddr);
      
      const [votingStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from('voting_state'), candidatePubkey.toBuffer()],
        programs.validatorProgram.programId
      );

      const votingState = await programs.validatorProgram.account.votingState.fetch(votingStatePda);
      
      const hasVoted = votingState.votesFor.some(v => v.toBase58() === wallet.publicKey.toBase58()) ||
                       votingState.votesAgainst.some(v => v.toBase58() === wallet.publicKey.toBase58());
      
      return {
        candidate: votingState.candidateInstitute.toBase58(),
        votesFor: votingState.votesFor.length,
        votesAgainst: votingState.votesAgainst.length,
        totalEligible: votingState.totalEligibleVoters,
        status: votingState.status,
        hasVoted,
        createdAt: new Date(votingState.createdAt.toNumber() * 1000).toLocaleString()
      };
    } catch (err) {
      return null;
    }
  };

  const [checkCandidateAddress, setCheckCandidateAddress] = useState('');
  const [checkedElection, setCheckedElection] = useState(null);
  const [checking, setChecking] = useState(false);

  const handleCheckElection = async () => {
    if (!checkCandidateAddress.trim()) {
      showMessage('error', 'Please enter a candidate address');
      return;
    }

    setChecking(true);
    const result = await checkVotingState(checkCandidateAddress);
    
    if (result) {
      setCheckedElection(result);
      showMessage('success', 'Election found!');
    } else {
      setCheckedElection(null);
      showMessage('error', 'No election found for this address');
    }
    setChecking(false);
  };

  const voteOnCandidate = async (candidateAddr, voteFor) => {
    if (!isRegistered) {
      showMessage('error', 'Only registered institutes can vote');
      return;
    }

    setLoading(true);
    try {
      const candidatePubkey = new PublicKey(candidateAddr);
      
      const [votingStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from('voting_state'), candidatePubkey.toBuffer()],
        programs.validatorProgram.programId
      );

      const [registryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('institute_registry')],
        programs.validatorProgram.programId
      );

      await programs.validatorProgram.methods
        .vote(voteFor)
        .accounts({
          votingState: votingStatePda,
          instituteRegistry: registryPda,
          voter: wallet.publicKey,
        })
        .rpc();

      showMessage('success', `Vote ${voteFor ? 'FOR' : 'AGAINST'} recorded successfully!`);
      await checkRegistry();
      
      // Refresh the election data
      if (checkCandidateAddress) {
        await handleCheckElection();
      }
    } catch (err) {
      console.error('Vote error:', err);
      if (err.toString().includes('AlreadyVoted')) {
        showMessage('error', 'You have already voted on this candidate');
      } else if (err.toString().includes('VotingNotActive')) {
        showMessage('error', 'This election is no longer active');
      } else {
        showMessage('error', 'Failed to vote: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    if (status.active) {
      return <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">🟢 Active</span>;
    } else if (status.approved) {
      return <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">✅ Approved</span>;
    } else if (status.rejected) {
      return <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold">❌ Rejected</span>;
    }
    return <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-semibold">Unknown</span>;
  };

  if (!wallet) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="inline-block p-4 bg-indigo-100 rounded-full mb-6">
            <Vote className="w-16 h-16 text-indigo-600" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Voting Portal</h1>
          <p className="text-gray-600 mb-8">Connect your wallet to participate in institute governance</p>
          <WalletMultiButton className="!bg-indigo-600 hover:!bg-indigo-700 !rounded-xl !text-lg !px-8 !py-4" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="bg-indigo-600 p-2 rounded-lg">
                <Vote className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Voting Portal</h1>
                <p className="text-xs text-gray-500">Institute Governance System</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {isRegistered ? (
                <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded-full flex items-center space-x-1">
                  <CheckCircle className="w-4 h-4" />
                  <span>Registered Institute</span>
                </span>
              ) : (
                <span className="px-3 py-1 bg-yellow-100 text-yellow-700 text-sm font-medium rounded-full flex items-center space-x-1">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Not Registered</span>
                </span>
              )}
              <WalletMultiButton className="!bg-indigo-600 hover:!bg-indigo-700 !rounded-lg" />
            </div>
          </div>
        </div>
      </header>

      {/* Message Alert */}
      {message.text && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
          <div className={`flex items-center p-4 rounded-xl ${
            message.type === 'success' 
              ? 'bg-green-50 text-green-800 border border-green-200' 
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {message.type === 'success' ? 
              <CheckCircle className="w-5 h-5 mr-3" /> : 
              <AlertTriangle className="w-5 h-5 mr-3" />
            }
            <span className="font-medium">{message.text}</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="bg-blue-100 p-3 rounded-lg">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <TrendingUp className="w-5 h-5 text-green-500" />
            </div>
            <h3 className="text-3xl font-bold text-gray-900 mb-1">{registryInfo?.count || 0}</h3>
            <p className="text-sm text-gray-600">Registered Institutes</p>
          </div>

          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="bg-purple-100 p-3 rounded-lg">
                <Vote className="w-6 h-6 text-purple-600" />
              </div>
              <Clock className="w-5 h-5 text-orange-500" />
            </div>
            <h3 className="text-3xl font-bold text-gray-900 mb-1">100%</h3>
            <p className="text-sm text-gray-600">Approval Required</p>
          </div>

          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="bg-green-100 p-3 rounded-lg">
                <Shield className="w-6 h-6 text-green-600" />
              </div>
              <Award className="w-5 h-5 text-yellow-500" />
            </div>
            <h3 className="text-3xl font-bold text-gray-900 mb-1">
              {isRegistered ? 'Yes' : 'No'}
            </h3>
            <p className="text-sm text-gray-600">Your Voting Rights</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex space-x-2 mb-6 border-b border-gray-200">
          {[
            { id: 'elections', label: 'Active Elections', icon: Vote },
            { id: 'propose', label: 'Propose Institute', icon: UserPlus },
            { id: 'institutes', label: 'All Institutes', icon: Users }
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-6 py-3 font-medium transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600'
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
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          {activeTab === 'elections' && (
            <div className="p-8">
              <div className="flex items-center space-x-3 mb-6">
                <Vote className="w-6 h-6 text-indigo-600" />
                <h2 className="text-2xl font-bold text-gray-900">Check Election Status</h2>
              </div>
              
              <p className="text-gray-600 mb-6">
                Enter a candidate's address to view their election status and cast your vote.
              </p>

              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
                <div className="flex items-start space-x-2">
                  <AlertTriangle className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-indigo-800">
                    <p className="font-semibold mb-1">How Elections Work:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Any wallet can propose a new institute candidate</li>
                      <li>All registered institutes must vote (100% participation required)</li>
                      <li>100% approval needed for admission</li>
                      <li>If even one institute votes against, the candidate is rejected</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Candidate Address
                  </label>
                  <div className="flex space-x-3">
                    <input
                      type="text"
                      value={checkCandidateAddress}
                      onChange={(e) => setCheckCandidateAddress(e.target.value)}
                      placeholder="Enter Solana address"
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                    />
                    <button
                      onClick={handleCheckElection}
                      disabled={checking || !checkCandidateAddress}
                      className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                    >
                      {checking ? 'Checking...' : 'Check Status'}
                    </button>
                  </div>
                </div>

                {checkedElection && (
                  <div className="mt-6 border-2 border-indigo-200 rounded-xl p-6 bg-indigo-50">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-lg font-bold text-gray-900">Election Details</h3>
                      {getStatusBadge(checkedElection.status)}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      <div className="bg-white rounded-lg p-4 border border-gray-200">
                        <p className="text-sm text-gray-600 mb-1">Candidate Address</p>
                        <p className="text-xs font-mono text-gray-900 break-all">{checkedElection.candidate}</p>
                      </div>

                      <div className="bg-white rounded-lg p-4 border border-gray-200">
                        <p className="text-sm text-gray-600 mb-1">Created At</p>
                        <p className="text-sm text-gray-900">{checkedElection.createdAt}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className="bg-white rounded-lg p-4 border border-green-200 text-center">
                        <p className="text-3xl font-bold text-green-600">{checkedElection.votesFor}</p>
                        <p className="text-sm text-gray-600 mt-1">Votes For</p>
                      </div>

                      <div className="bg-white rounded-lg p-4 border border-red-200 text-center">
                        <p className="text-3xl font-bold text-red-600">{checkedElection.votesAgainst}</p>
                        <p className="text-sm text-gray-600 mt-1">Votes Against</p>
                      </div>

                      <div className="bg-white rounded-lg p-4 border border-gray-200 text-center">
                        <p className="text-3xl font-bold text-gray-900">{checkedElection.totalEligible}</p>
                        <p className="text-sm text-gray-600 mt-1">Total Eligible</p>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mb-6">
                      <div className="flex justify-between text-sm text-gray-600 mb-2">
                        <span>Voting Progress</span>
                        <span>{((checkedElection.votesFor + checkedElection.votesAgainst) / checkedElection.totalEligible * 100).toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div 
                          className="bg-indigo-600 h-3 rounded-full transition-all"
                          style={{width: `${(checkedElection.votesFor + checkedElection.votesAgainst) / checkedElection.totalEligible * 100}%`}}
                        />
                      </div>
                    </div>

                    {checkedElection.hasVoted && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                        <div className="flex items-center space-x-2">
                          <CheckCircle className="w-5 h-5 text-blue-600" />
                          <p className="text-sm font-medium text-blue-900">You have already voted on this candidate</p>
                        </div>
                      </div>
                    )}

                    {isRegistered && checkedElection.status.active && !checkedElection.hasVoted && (
                      <div className="flex space-x-4">
                        <button
                          onClick={() => voteOnCandidate(checkedElection.candidate, true)}
                          disabled={loading}
                          className="flex-1 flex items-center justify-center space-x-2 px-6 py-4 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors shadow-lg"
                        >
                          {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle className="w-5 h-5" />
                              <span>Vote FOR</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => voteOnCandidate(checkedElection.candidate, false)}
                          disabled={loading}
                          className="flex-1 flex items-center justify-center space-x-2 px-6 py-4 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:bg-gray-400 transition-colors shadow-lg"
                        >
                          {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <>
                              <XCircle className="w-5 h-5" />
                              <span>Vote AGAINST</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {!isRegistered && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <p className="text-sm text-yellow-800">
                          <strong>Note:</strong> Only registered institutes can vote. You need to be proposed and approved first.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'propose' && (
            <div className="p-8">
              <div className="flex items-center space-x-3 mb-6">
                <UserPlus className="w-6 h-6 text-indigo-600" />
                <h2 className="text-2xl font-bold text-gray-900">Propose New Institute</h2>
              </div>

              <p className="text-gray-600 mb-6">
                Create an election to add a new institute to the registry. All registered institutes must vote for approval.
              </p>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <div className="flex items-start space-x-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-yellow-800">
                    <p className="font-semibold mb-1">Approval Requirements:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>100% of registered institutes must vote</li>
                      <li>100% must vote FOR (unanimous approval)</li>
                      <li>Even one vote against will reject the candidate</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Candidate Institute Address
                  </label>
                  <input
                    type="text"
                    value={candidateAddress}
                    onChange={(e) => setCandidateAddress(e.target.value)}
                    placeholder="Enter Solana wallet address"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Enter the wallet address of the institute you want to propose
                  </p>
                </div>

                <button
                  onClick={proposeNewInstitute}
                  disabled={loading || !candidateAddress}
                  className="flex items-center justify-center space-x-2 w-full px-6 py-4 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors shadow-lg"
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
            </div>
          )}

          {activeTab === 'institutes' && (
            <div className="p-8">
              <div className="flex items-center space-x-3 mb-6">
                <Users className="w-6 h-6 text-indigo-600" />
                <h2 className="text-2xl font-bold text-gray-900">Registered Institutes</h2>
              </div>

              <p className="text-gray-600 mb-6">
                All institutes currently registered in the governance system
              </p>

              <div className="space-y-3">
                {registryInfo?.institutes.map((inst, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-indigo-300 transition-colors">
                    <div className="flex items-center space-x-3">
                      <div className="bg-indigo-100 p-2 rounded-lg">
                        <Shield className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div>
                        <p className="text-sm font-mono text-gray-900">{inst.toBase58()}</p>
                        <p className="text-xs text-gray-500">Institute #{idx + 1}</p>
                      </div>
                    </div>
                    {inst.toBase58() === wallet.publicKey.toBase58() && (
                      <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                        You
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {registryInfo?.institutes.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  No institutes registered yet
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-sm text-gray-500 mt-12">
        <p>Voting Portal - Decentralized Institute Governance</p>
      </footer>
    </div>
  );
};

export default VotingPortal;