const mongoose = require('mongoose');

const emergencySchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  patientUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  patientName: {
    type: String,
    default: ''
  },
  patientAddress: {
    type: String,
    default: ''
  },
  condition: {
    type: String,
    enum: [
      'high_bp',
      'low_bp',
      'cardiac_emergency',
      'no_pulse',
      'getting_low_pulse'
    ],
    required: true
  },
  bpValue: {
    type: Number,
    default: 0
  },
  heartRate: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: [
      'pending',
      'ambulance_assigned',
      'ambulance_arrived',
      'patient_picked',
      'heading_to_hospital',
      'hospital_notified',
      'completed'
    ],
    default: 'pending'
  },
  ambulanceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  ambulanceName: {
    type: String,
    default: null
  },
  selectedHospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  selectedHospitalName: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Emergency', emergencySchema);