import React, { useEffect, useRef, useState } from 'react';
import { Pencil, Search, Trash2, Upload, UserPlus, X } from 'lucide-react';
import type {
  StudentRecord,
  UnregisteredScanPayload,
} from '../types/attendance.ts';
import {
  formatRfidUidDisplay,
  validateStudentEnrollment,
} from '../utils/attendanceLogic.ts';
import { resizeImageFileToDataUrl } from '../utils/imageResize.ts';
import { StudentAvatar } from './StudentAvatar.tsx';

interface AdminEnrollmentViewProps {
  students: StudentRecord[];
  prefillRfidUid: string | null;
  unregisteredScan: UnregisteredScanPayload | null;
  onClearPrefill: () => void;
  onCreateStudent: (payload: {
    rfidUid: string;
    rollNumber: string;
    fullName: string;
    classGrade: number;
    section: string;
    guardianName: string | null;
    guardianPhone: string | null;
    photoDataUrl: string | null;
  }) => Promise<void>;
  onUpdateStudent: (
    id: number,
    payload: {
      rfidUid: string;
      rollNumber: string;
      fullName: string;
      classGrade: number;
      section: string;
      guardianName: string | null;
      guardianPhone: string | null;
      photoDataUrl: string | null;
    }
  ) => Promise<void>;
  onDeleteStudent: (id: number) => Promise<void>;
}

export function AdminEnrollmentView({
  students,
  prefillRfidUid,
  unregisteredScan,
  onClearPrefill,
  onCreateStudent,
  onUpdateStudent,
  onDeleteStudent,
}: AdminEnrollmentViewProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [fullName, setFullName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [classGrade, setClassGrade] = useState<number>(1);
  const [section, setSection] = useState('A');
  const [rfidUid, setRfidUid] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Directory filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterGrade, setFilterGrade] = useState<number | ''>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (prefillRfidUid) {
      setRfidUid(formatRfidUidDisplay(prefillRfidUid));
      onClearPrefill();
    }
  }, [prefillRfidUid, onClearPrefill]);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormError(null);
    try {
      const resized = await resizeImageFileToDataUrl(file, 320);
      setPhotoDataUrl(resized);
    } catch (err: any) {
      setFormError(err?.message || 'Could not process image file.');
    }
    e.target.value = '';
  };

  const resetForm = () => {
    setEditingId(null);
    setFullName('');
    setRollNumber('');
    setClassGrade(1);
    setSection('A');
    setRfidUid('');
    setGuardianName('');
    setGuardianPhone('');
    setPhotoDataUrl(null);
    setFieldErrors({});
    setFormError(null);
  };

  const startEditing = (student: StudentRecord) => {
    setEditingId(student.id);
    setFullName(student.fullName);
    setRollNumber(student.rollNumber);
    setClassGrade(student.classGrade);
    setSection(student.section);
    setRfidUid(formatRfidUidDisplay(student.rfidUid));
    setGuardianName(student.guardianName || '');
    setGuardianPhone(student.guardianPhone || '');
    setPhotoDataUrl(student.photoDataUrl);
    setFieldErrors({});
    setFormError(null);
    setFormSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const validation = validateStudentEnrollment({
      rfidUid,
      rollNumber,
      fullName,
      classGrade,
      section,
      guardianName: guardianName || null,
      guardianPhone: guardianPhone || null,
      photoDataUrl,
    });

    if (!validation.valid) {
      setFieldErrors(validation.errors);
      return;
    }

    setFieldErrors({});
    setSubmitting(true);

    try {
      const payload = {
        rfidUid: validation.normalizedRfidUid,
        rollNumber: rollNumber.trim(),
        fullName: fullName.trim(),
        classGrade: Number(classGrade),
        section: validation.normalizedSection,
        guardianName: guardianName.trim() || null,
        guardianPhone: guardianPhone.trim() || null,
        photoDataUrl,
      };

      if (editingId !== null) {
        await onUpdateStudent(editingId, payload);
        setFormSuccess(`Updated student profile for ${payload.fullName}.`);
      } else {
        await onCreateStudent(payload);
        setFormSuccess(
          `Enrolled ${payload.fullName} (Class ${payload.classGrade}-${payload.section}).`
        );
      }
      resetForm();
    } catch (err: any) {
      if (err?.fieldErrors) {
        setFieldErrors(err.fieldErrors);
      }
      setFormError(err?.message || 'Failed to save student record.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredStudents = students.filter((s) => {
    if (filterGrade && s.classGrade !== filterGrade) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      return (
        s.fullName.toLowerCase().includes(q) ||
        s.rollNumber.toLowerCase().includes(q) ||
        s.rfidUid.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Admin Enrollment Portal
        </h1>
        <p className="text-sm text-slate-500">
          Manually register students from Class 1 to Class 12, assign RFID
          card tags, and upload student photos
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Enrollment Form */}
        <section className="xl:col-span-5 bg-white border border-slate-200/85 rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              {editingId ? 'Edit Student Record' : 'Enroll New Student'}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                Cancel Edit
              </button>
            )}
          </div>

          {unregisteredScan && (
            <div className="p-3 rounded-lg bg-[#2D72A8]/10 border border-[#2D72A8]/25 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-700">
                Last tapped unregistered card:{' '}
                <span className="font-sans font-semibold text-slate-900">
                  {formatRfidUidDisplay(unregisteredScan.rfidUid)}
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  setRfidUid(formatRfidUidDisplay(unregisteredScan.rfidUid))
                }
                className="px-2.5 py-1 rounded bg-[#2D72A8] hover:bg-[#235B87] text-white text-xs font-medium whitespace-nowrap cursor-pointer"
              >
                Fill RFID Tag
              </button>
            </div>
          )}

          {formError && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700"
            >
              {formError}
            </div>
          )}

          {formSuccess && (
            <div
              role="status"
              className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800"
            >
              {formSuccess}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Photo Upload Only (No Camera Access) */}
            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-700">
                Student Portrait Photo
              </span>
              <div className="flex items-center gap-4">
                {photoDataUrl ? (
                  <div className="relative">
                    <img
                      src={photoDataUrl}
                      alt="Student portrait preview"
                      className="w-20 h-20 rounded-xl object-cover border border-slate-200"
                    />
                    <button
                      type="button"
                      aria-label="Remove student photo"
                      onClick={() => setPhotoDataUrl(null)}
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center hover:bg-slate-700 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-xs text-slate-400 text-center px-2">
                    No photo
                  </div>
                )}

                <div className="space-y-1.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelected}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3.5 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-medium text-slate-700 flex items-center gap-2 whitespace-nowrap cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Upload Photo</span>
                  </button>
                  <p className="text-[11px] text-slate-400">
                    JPG or PNG · Automatically cropped to portrait
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="rfid-uid"
                className="block text-xs font-medium text-slate-700"
              >
                RFID Card UID *
              </label>
              <input
                id="rfid-uid"
                type="text"
                value={rfidUid}
                onChange={(e) => setRfidUid(e.target.value)}
                placeholder="e.g. A1:B2:C3:D4"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#2D72A8] focus:border-[#2D72A8]"
              />
              {fieldErrors.rfidUid && (
                <p className="text-xs text-red-600">{fieldErrors.rfidUid}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="full-name"
                className="block text-xs font-medium text-slate-700"
              >
                Student Full Name *
              </label>
              <input
                id="full-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter student full name"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2D72A8] focus:border-[#2D72A8]"
              />
              {fieldErrors.fullName && (
                <p className="text-xs text-red-600">{fieldErrors.fullName}</p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="class-grade"
                  className="block text-xs font-medium text-slate-700"
                >
                  Class (1–12) *
                </label>
                <select
                  id="class-grade"
                  value={classGrade}
                  onChange={(e) => setClassGrade(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2D72A8]"
                >
                  {Array.from({ length: 12 }, (_, idx) => idx + 1).map((g) => (
                    <option key={g} value={g}>
                      Class {g}
                    </option>
                  ))}
                </select>
                {fieldErrors.classGrade && (
                  <p className="text-xs text-red-600">
                    {fieldErrors.classGrade}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="section"
                  className="block text-xs font-medium text-slate-700"
                >
                  Section *
                </label>
                <input
                  id="section"
                  type="text"
                  maxLength={4}
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  placeholder="A"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-[#2D72A8]"
                />
                {fieldErrors.section && (
                  <p className="text-xs text-red-600">{fieldErrors.section}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="roll-number"
                  className="block text-xs font-medium text-slate-700"
                >
                  Roll No. *
                </label>
                <input
                  id="roll-number"
                  type="text"
                  value={rollNumber}
                  onChange={(e) => setRollNumber(e.target.value)}
                  placeholder="e.g. 104"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#2D72A8]"
                />
                {fieldErrors.rollNumber && (
                  <p className="text-xs text-red-600">
                    {fieldErrors.rollNumber}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="guardian-name"
                  className="block text-xs font-medium text-slate-700"
                >
                  Guardian Name
                </label>
                <input
                  id="guardian-name"
                  type="text"
                  value={guardianName}
                  onChange={(e) => setGuardianName(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2D72A8]"
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="guardian-phone"
                  className="block text-xs font-medium text-slate-700"
                >
                  Guardian Phone
                </label>
                <input
                  id="guardian-phone"
                  type="tel"
                  value={guardianPhone}
                  onChange={(e) => setGuardianPhone(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2D72A8]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-lg bg-[#2D72A8] hover:bg-[#235B87] disabled:opacity-60 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" aria-hidden="true" />
              <span>
                {submitting
                  ? 'Saving Student...'
                  : editingId
                    ? 'Save Changes'
                    : 'Enroll Student'}
              </span>
            </button>
          </form>
        </section>

        {/* Enrolled Student Directory */}
        <section className="xl:col-span-7 bg-white border border-slate-200/85 rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">
              Enrolled Roster ({filteredStudents.length})
            </h2>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  aria-label="Search enrolled students"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name, roll, UID"
                  className="pl-9 pr-3 py-1.5 rounded-lg border border-slate-300 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-[#2D72A8]"
                />
              </div>

              <select
                aria-label="Filter roster by class"
                value={filterGrade}
                onChange={(e) =>
                  setFilterGrade(
                    e.target.value ? Number(e.target.value) : ''
                  )
                }
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white min-w-[168px] focus:outline-none focus:ring-2 focus:ring-[#2D72A8]"
              >
                <option value="">All Classes (1–12)</option>
                {Array.from({ length: 12 }, (_, idx) => idx + 1).map((g) => (
                  <option key={g} value={g}>
                    Class {g}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filteredStudents.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <p className="text-sm font-medium text-slate-700">
                {students.length === 0
                  ? 'No students enrolled yet'
                  : 'No students match your filter'}
              </p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {students.length === 0
                  ? 'Use the manual enrollment form on the left to register your first student with their RFID card UID and photo.'
                  : 'Clear the search input or select All Classes to view every enrolled student.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-4">Student</th>
                    <th className="py-2.5 px-3">Class</th>
                    <th className="py-2.5 px-3">Roll</th>
                    <th className="py-2.5 px-3">RFID UID</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredStudents.map((student) => (
                    <tr key={student.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-3">
                          <StudentAvatar
                            name={student.fullName}
                            photoDataUrl={student.photoDataUrl}
                            sizeClass="w-9 h-9"
                          />
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 truncate">
                              {student.fullName}
                            </p>
                            {student.guardianName && (
                              <p className="text-xs text-slate-400 truncate">
                                Guardian: {student.guardianName}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                        Class {student.classGrade}-{student.section}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-xs tabular-nums text-slate-700">
                        {student.rollNumber}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-xs text-slate-600 whitespace-nowrap">
                        {formatRfidUidDisplay(student.rfidUid)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`text-xs font-semibold ${
                            student.currentStatus === 'IN'
                              ? 'text-emerald-700'
                              : 'text-slate-500'
                          }`}
                        >
                          {student.currentStatus === 'IN'
                            ? 'On Campus'
                            : 'Checked Out'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        {confirmDeleteId === student.id ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={async () => {
                                await onDeleteStudent(student.id);
                                setConfirmDeleteId(null);
                              }}
                              className="px-2 py-1 rounded bg-red-600 text-white text-xs font-medium cursor-pointer"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 rounded border border-slate-300 text-slate-600 text-xs font-medium cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              aria-label={`Edit ${student.fullName}`}
                              onClick={() => startEditing(student)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                            >
                              <Pencil className="w-4 h-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete ${student.fullName}`}
                              onClick={() => setConfirmDeleteId(student.id)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" aria-hidden="true" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
