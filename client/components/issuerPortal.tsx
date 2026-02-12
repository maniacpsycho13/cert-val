'use client';
import React, { useState, useMemo } from 'react';
import { Upload, FileText, Hash, CheckCircle, AlertCircle, Loader2, X, Download, Eye } from 'lucide-react';
import { useAnchorWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { useAnchorPrograms } from '@/lib/useAnchorProgram';
import crypto from 'crypto';
import { PDFParse } from 'pdf-parse';
import axios from 'axios';



const IssuerPortal = () => {
  const wallet = useAnchorWallet();
  const programs = useAnchorPrograms();
  
  const [uploadedFile, setUploadedFile] = useState(null);
  const [pdfPreview, setPdfPreview] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    studentId: '',
    course: '',
    grade: '',
    issueDate: '',
    institution: '',
    additionalInfo: ''
  });
  const [issuedCertificates, setIssuedCertificates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [currentCertHash, setCurrentCertHash] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);

  React.useEffect(() => {
    if (wallet && programs) {
      checkRegistration();
    }
  }, [wallet, programs]);

  const checkRegistration = async () => {
    try {
      const [registryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('institute_registry')],
        programs.validatorProgram.programId
      );
      const registry = await programs.validatorProgram.account.instituteRegistry.fetch(registryPda);
      const registered = registry.registeredInstitutes.some(
        key => key.toBase58() === wallet.publicKey.toBase58()
      );
      setIsRegistered(registered);
    } catch (err) {
      setIsRegistered(false);
    }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  const certificateId = useMemo(() => {
    if (!formData.fullName || !formData.studentId) return '';
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `CERT-${timestamp}-${random}`;
  }, [formData.fullName, formData.studentId]);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      showMessage('error', 'Please upload a PDF file');
      return;
    }

    setUploadedFile(file);
    setPdfPreview(URL.createObjectURL(file));
    setExtracting(true);

    try {
      // Create FormData and append the file
      const formDataToSend = new FormData();
      formDataToSend.append('file', file);
      
      const response = await axios.post('https://pdf-parse-backend-p3dk.onrender.com/about', formDataToSend, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      
      console.log('Server Response:', response.data);
      setFormData(prev => ({ ...prev, ...response.data }));
      showMessage('success', 'PDF parsed successfully! Fields auto-filled.');
    } catch (error) {
      console.error('Error uploading PDF:', error);
      showMessage('error', 'Failed to upload PDF. Please try again.');
    } finally {
      setExtracting(false);
    }
    
    
  };

  const parseTextForCertificateData = (text) => {
    const parsed = {};
    
    // Remove extra whitespace and normalize
    const normalizedText = text.replace(/\s+/g, ' ').trim();
    
    // Name patterns - more flexible
    const namePatterns = [
      /(?:name|student\s*name|recipient)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
      /(?:this\s*certifies\s*that)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
      /(?:awarded\s*to)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
    ];
    for (const pattern of namePatterns) {
      const match = normalizedText.match(pattern);
      if (match && match[1]) {
        parsed.fullName = match[1].trim();
        break;
      }
    }
    
    // Student ID patterns
    const idPatterns = [
      /(?:student\s*id|id\s*number|roll\s*no|enrollment\s*no)[:\s#]*([A-Z0-9]+)/i,
      /(?:id)[:\s#]+([A-Z]{2,}\d+)/i,
    ];
    for (const pattern of idPatterns) {
      const match = normalizedText.match(pattern);
      if (match && match[1]) {
        parsed.studentId = match[1].trim();
        break;
      }
    }
    
    // Course patterns
    const coursePatterns = [
      /(?:course|program|degree|diploma)[:\s]+([A-Za-z\s&,]+?)(?:\.|Date|Grade|Issued)/i,
      /(?:bachelor|master|phd|diploma)\s+(?:of|in)\s+([A-Za-z\s]+)/i,
    ];
    for (const pattern of coursePatterns) {
      const match = normalizedText.match(pattern);
      if (match && match[1]) {
        parsed.course = match[1].trim();
        break;
      }
    }
    
    // Grade patterns
    const gradePatterns = [
      /(?:grade|gpa|cgpa|score|percentage)[:\s]+((?:[A-F][\+\-]?|\d+\.?\d*)\s*(?:%|\/\d+)?)/i,
      /(?:with|grade|result)[:\s]+([A-F][\+\-]?)/i,
    ];
    for (const pattern of gradePatterns) {
      const match = normalizedText.match(pattern);
      if (match && match[1]) {
        parsed.grade = match[1].trim();
        break;
      }
    }
    
    // Date patterns
    const datePatterns = [
      /(?:date|dated|issued\s*on)[:\s]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
      /(?:date|dated|issued\s*on)[:\s]*(\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
      /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i,
    ];
    for (const pattern of datePatterns) {
      const match = normalizedText.match(pattern);
      if (match && match[1]) {
        // Try to parse and format as YYYY-MM-DD
        try {
          const dateStr = match[1].trim();
          const date = new Date(dateStr);
          if (!isNaN(date.getTime())) {
            parsed.issueDate = date.toISOString().slice(0, 10);
          } else {
            parsed.issueDate = dateStr;
          }
        } catch {
          parsed.issueDate = match[1].trim();
        }
        break;
      }
    }
    
    // Institution patterns
    const institutionPatterns = [
      /(?:university|college|institute|academy)\s+(?:of\s+)?([A-Za-z\s]+?)(?:\.|Certifies|Date)/i,
      /([A-Za-z\s]+\s+(?:University|College|Institute|Academy))/i,
    ];
    for (const pattern of institutionPatterns) {
      const match = normalizedText.match(pattern);
      if (match && match[1]) {
        parsed.institution = match[1].trim();
        break;
      }
    }
    
    return parsed;
  };

  const generateCertificateData = () => {
    return `
      Full Name: ${formData.fullName}
      Student ID: ${formData.studentId}
      Course: ${formData.course}
      Grade: ${formData.grade}
      Issue Date: ${formData.issueDate}
      Institution: ${formData.institution}
      Additional Info: ${formData.additionalInfo}
    `.trim();
  };

  const createCertificateHash = (data) => {
    const hash = crypto.createHash('sha256').update(data).digest();
    return Array.from(hash);
  };

  const handleGenerateCertificate = () => {
    if (!formData.fullName || !formData.studentId || !formData.course) {
      showMessage('error', 'Please fill in all required fields');
      return;
    }

    const certData = generateCertificateData();
    const hash = createCertificateHash(certData);
    setCurrentCertHash(certData);
    setShowConfirmation(true);
  };

  const handleIssueCertificate = async () => {
    if (!isRegistered) {
      showMessage('error', 'Only registered institutes can issue certificates');
      return;
    }

    setLoading(true);
    try {
      const certHash = createCertificateHash(currentCertHash);
      const certHashArray = new Uint8Array(certHash);

      const [certificatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from('certificate'), Buffer.from(certHashArray)],
        programs.certificateProgram.programId
      );

      const [registryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('institute_registry')],
        programs.validatorProgram.programId
      );

      // Get the transaction signature
      const signature = await programs.certificateProgram.methods
        .addCertificate(Array.from(certHashArray))
        .accounts({
          certificate: certificatePda,
          issuer: wallet.publicKey,
          instituteRegistry: registryPda,
          instituteValidatorProgram: programs.validatorProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log('Transaction Signature:', signature);

      const newCert = {
        certificateId,
        name: formData.fullName,
        course: formData.course,
        dateIssued: formData.issueDate || new Date().toISOString().slice(0, 10),
        status: 'Issued',
        hash: Buffer.from(certHashArray).toString('hex').slice(0, 16) + '...',
        signature: signature, // Store the signature
        explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`
      };

      setIssuedCertificates(prev => [newCert, ...prev]);
      showMessage('success', `Certificate issued! Signature: ${signature.slice(0, 8)}...`);
      handleReset();
      setShowConfirmation(false);
    } catch (err) {
      console.error('Error issuing certificate:', err);
      showMessage('error', 'Failed to issue certificate: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFormData({
      fullName: '',
      studentId: '',
      course: '',
      grade: '',
      issueDate: '',
      institution: '',
      additionalInfo: ''
    });
    setUploadedFile(null);
    setPdfPreview(null);
    setCurrentCertHash('');
  };

  const removeFile = () => {
    setUploadedFile(null);
    setPdfPreview(null);
  };

  if (!wallet) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <FileText className="w-20 h-20 text-blue-600 mx-auto mb-6" />
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Certificate Issuer Portal</h1>
          <p className="text-gray-600 mb-8">Connect your wallet to start issuing certificates on the blockchain</p>
          <WalletMultiButton className="!bg-blue-600 hover:!bg-blue-700 !rounded-xl !text-lg !px-8 !py-4" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="bg-blue-600 p-2 rounded-lg">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Issuer Portal</h1>
                <p className="text-xs text-gray-500">Blockchain Certificate Management</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {isRegistered ? (
                <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded-full">
                  ✓ Registered Institute
                </span>
              ) : (
                <span className="px-3 py-1 bg-yellow-100 text-yellow-700 text-sm font-medium rounded-full">
                  Not Registered
                </span>
              )}
              <WalletMultiButton className="!bg-blue-600 hover:!bg-blue-700 !rounded-lg" />
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
              <AlertCircle className="w-5 h-5 mr-3" />
            }
            <span className="font-medium">{message.text}</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Certificate Creation Card */}
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6">
            <h2 className="text-2xl font-bold text-white">Create Certificate</h2>
            <p className="text-blue-100 mt-1">Upload a PDF or enter details manually</p>
          </div>

          <div className="p-8">
            {/* PDF Upload Section */}
            <div className="mb-8">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Upload Certificate PDF (Optional)
              </label>
              
              {!uploadedFile ? (
                <div className="relative">
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="pdf-upload"
                    disabled={extracting}
                  />
                  <label
                    htmlFor="pdf-upload"
                    className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-500 transition-colors cursor-pointer bg-gray-50 hover:bg-blue-50 ${
                      extracting ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {extracting ? (
                      <>
                        <Loader2 className="w-12 h-12 text-blue-600 mb-3 animate-spin" />
                        <span className="text-sm font-medium text-gray-700">Extracting text from PDF...</span>
                        <span className="text-xs text-gray-500 mt-1">This may take a few seconds</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-12 h-12 text-gray-400 mb-3" />
                        <span className="text-sm font-medium text-gray-700">Click to upload PDF</span>
                        <span className="text-xs text-gray-500 mt-1">We'll auto-extract certificate details using pdf-parse</span>
                      </>
                    )}
                  </label>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="flex items-center space-x-3">
                    <FileText className="w-8 h-8 text-blue-600" />
                    <div>
                      <p className="font-medium text-gray-900">{uploadedFile.name}</p>
                      <p className="text-xs text-gray-500">{(uploadedFile.size / 1024).toFixed(2)} KB</p>
                    </div>
                  </div>
                  <button
                    onClick={removeFile}
                    className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
              )}
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Student ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.studentId}
                  onChange={(e) => setFormData({...formData, studentId: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="STU123456"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Course/Program <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.course}
                  onChange={(e) => setFormData({...formData, course: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Bachelor of Science"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Grade/GPA
                </label>
                <input
                  type="text"
                  value={formData.grade}
                  onChange={(e) => setFormData({...formData, grade: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="A+ / 4.0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Issue Date
                </label>
                <input
                  type="date"
                  value={formData.issueDate}
                  onChange={(e) => setFormData({...formData, issueDate: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Institution Name
                </label>
                <input
                  type="text"
                  value={formData.institution}
                  onChange={(e) => setFormData({...formData, institution: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="University Name"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Additional Information
                </label>
                <textarea
                  value={formData.additionalInfo}
                  onChange={(e) => setFormData({...formData, additionalInfo: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                  placeholder="Any additional notes or information"
                />
              </div>
            </div>

            {/* Certificate ID Preview */}
            {certificateId && (
              <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center space-x-2">
                  <Hash className="w-5 h-5 text-gray-600" />
                  <span className="text-sm font-medium text-gray-700">Certificate ID:</span>
                  <code className="text-sm font-mono text-blue-600">{certificateId}</code>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end space-x-4 mt-8">
              <button
                onClick={handleReset}
                className="px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Reset
              </button>
              <button
                onClick={handleGenerateCertificate}
                disabled={!isRegistered}
                className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                <FileText className="w-5 h-5" />
                <span>Generate Certificate</span>
              </button>
            </div>
          </div>
        </div>

        {/* Recently Issued */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Recently Issued</h2>
              <p className="text-sm text-gray-500">Certificates issued in this session</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Certificate ID</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Course</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Date Issued</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Transaction</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {issuedCertificates.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                        No certificates issued yet
                      </td>
                    </tr>
                  ) : (
                    issuedCertificates.map((cert, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm font-mono text-gray-900">{cert.certificateId}</td>
                        <td className="px-6 py-4 text-sm text-gray-900">{cert.name}</td>
                        <td className="px-6 py-4 text-sm text-gray-700">{cert.course}</td>
                        <td className="px-6 py-4 text-sm text-gray-700">{cert.dateIssued}</td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            {cert.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {cert.signature && (
                            <div className="flex items-center space-x-2">
                              <a
                                href={cert.explorerUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-mono text-blue-600 hover:text-blue-800 hover:underline"
                                title={cert.signature}
                              >
                                {cert.signature.slice(0, 8)}...{cert.signature.slice(-8)}
                              </a>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(cert.signature);
                                  showMessage('success', 'Signature copied!');
                                }}
                                className="p-1 hover:bg-gray-200 rounded transition-colors"
                                title="Copy signature"
                              >
                                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              </button>
                              <a
                                href={cert.explorerUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 hover:bg-gray-200 rounded transition-colors"
                                title="View on Solana Explorer"
                              >
                                <Eye className="w-4 h-4 text-gray-600" />
                              </a>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* Confirmation Dialog */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
            <div className="flex items-center space-x-3 mb-6">
              <div className="bg-blue-100 p-3 rounded-full">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900">Confirm Issuance</h3>
            </div>
            
            <div className="space-y-3 mb-8">
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-sm font-medium text-gray-600">Certificate ID:</span>
                <span className="text-sm font-mono text-gray-900">{certificateId}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-sm font-medium text-gray-600">Student:</span>
                <span className="text-sm text-gray-900">{formData.fullName}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-sm font-medium text-gray-600">Course:</span>
                <span className="text-sm text-gray-900">{formData.course}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-sm font-medium text-gray-600">Issue Date:</span>
                <span className="text-sm text-gray-900">{formData.issueDate || new Date().toISOString().slice(0, 10)}</span>
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> Once issued on the blockchain, this certificate cannot be deleted, only corrected.
              </p>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setShowConfirmation(false)}
                className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleIssueCertificate}
                disabled={loading}
                className="flex-1 flex items-center justify-center space-x-2 px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Issuing...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    <span>Issue on Blockchain</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IssuerPortal;