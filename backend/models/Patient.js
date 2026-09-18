const mongoose = require('mongoose');

const hospitalPreferenceSchema = new mongoose.Schema({
  order: Number,
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  hospitalName: String
});

const patientSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  age: {
    type: Number,
    required: true
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
    required: true
  },
  address: {
    type: String,
    required: true
  },
  previousHealthProblems: {
    type: String,
    default: ''
  },
  previousSurgeries: {
    type: String,
    default: ''
  },
  livingWith: {
    type: String,
    enum: ['family', 'friends', 'alone', 'sometimes alone'],
    required: true
  },
  emergencyContact: {
    type: String,
    required: true
  },
  hospitalPreferences: [hospitalPreferenceSchema],
  healthDocuments: [
    {
      filename: String,
      originalName: String,
      uploadDate: {
        type: Date,
        default: Date.now
      }
    }
  ],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Patient', patientSchema);