import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assignFilePair, fetchAssignmentsForManager, fetchManagerFilePairs, fetchQAUsers } from '../api';
import type { PaginatedResponse } from '../api';
import { Assignment, FilePair, User } from '../types';

const ManagerPanel = () => {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [assignmentPage, setAssignmentPage] = useState(1);
  const [teamFilter, setTeamFilter] = useState('');
  const [qaFilter, setQaFilter] = useState('');
  const [fileToAssign, setFileToAssign] = useState('');
  const [qaTarget, setQaTarget] = useState('');
  const [teamForAssign, setTeamForAssign] = useState('');
  const [message, setMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTeam, setModalTeam] = useState('');
  const [modalQa, setModalQa] = useState('');
  const [modalFile, setModalFile] = useState<FilePair | null>(null);

  const filePairsQuery = useQuery<PaginatedResponse<FilePair>>({
    queryKey: ['managerFiles', status, search, page],
    queryFn: async () => {
      const response = await fetchManagerFilePairs({ status, search, page });
      return response.data;
    },
  });

  const qaUsersQuery = useQuery({
    queryKey: ['qaUsers'],
    queryFn: async () => {
      const response = await fetchQAUsers();
      return response.data.data;
    },
  });

  const assignmentsQuery = useQuery<PaginatedResponse<Assignment>>({
    queryKey: ['managerAssignments', teamFilter, qaFilter, assignmentPage],
    queryFn: async () => {
      const response = await fetchAssignmentsForManager({
        teamTag: teamFilter || undefined,
        qaUserId: qaFilter || undefined,
        page: assignmentPage,
      });
      return response.data;
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({ fileId, qaId }: { fileId: string; qaId: string }) =>
      assignFilePair({ filePairId: fileId, qaUserId: qaId }),
    onSuccess: () => {
      setMessage('Assignment recorded');
      setFileToAssign('');
      setQaTarget('');
      setTeamForAssign('');
      setModalOpen(false);
      setModalQa('');
      setModalTeam('');
      setModalFile(null);
      queryClient.invalidateQueries({ queryKey: ['managerAssignments'] });
      queryClient.invalidateQueries({ queryKey: ['managerFiles'] });
    },
    onError: (error: any) => setMessage(error?.response?.data?.message || 'Unable to assign'),
  });

  const handleAssign = () => {
    if (!fileToAssign || !qaTarget || !teamForAssign) {
      setMessage('Select team, file pair, and QA member');
      return;
    }
    assignMutation.mutate({ fileId: fileToAssign, qaId: qaTarget });
  };

  const files = filePairsQuery.data?.data ?? [];
  const filePagination = filePairsQuery.data?.pagination;
  const assignments = assignmentsQuery.data?.data ?? [];
  const assignmentPagination = assignmentsQuery.data?.pagination;
  const qaUsers = qaUsersQuery.data ?? [];
  const filterUsers = (team: string) =>
    team ? qaUsers.filter((user: User) => user.role === team) : qaUsers;
  const qaUsersForTeam = filterUsers(teamForAssign);
  const modalUsers = filterUsers(modalTeam);

  const handleModalAssign = () => {
    if (!modalFile || !modalTeam || !modalQa) {
      setMessage('Select team and QA member for reassignment');
      return;
    }
    assignMutation.mutate({ fileId: modalFile._id, qaId: modalQa });
  };

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h2 style={{ margin: 0 }}>QA Manager Deck</h2>
        <p style={{ color: 'var(--muted)' }}>Assign processing files to QA1/QA2 and monitor statuses.</p>
      </div>

      <div className="card" style={{ background: 'rgba(2,6,23,0.6)' }}>
        <h3>Assign / Reassign file pairs</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <select
            className="select"
            value={teamForAssign}
            onChange={(e) => {
              setTeamForAssign(e.target.value);
              setQaTarget('');
            }}
          >
            <option value="">Select QA team</option>
            <option value="QA1">QA1</option>
            <option value="QA2">QA2</option>
          </select>
          <select className="select" value={qaTarget} onChange={(e) => setQaTarget(e.target.value)}>
            <option value="">Select QA member</option>
            {qaUsersForTeam.map((user: User) => (
              <option key={user.id} value={user.id}>
                {user.name} - {user.role}
              </option>
            ))}
          </select>
          <select className="select" value={fileToAssign} onChange={(e) => setFileToAssign(e.target.value)}>
            <option value="">Select available file pair</option>
            {files.map((file: FilePair) => (
              <option key={file._id} value={file._id}>
                {file.baseName} ({file.status})
              </option>
            ))}
          </select>
        </div>
        <button className="btn" style={{ marginTop: '1rem', width: 'fit-content' }} onClick={handleAssign} disabled={assignMutation.isPending}>
          {assignMutation.isPending ? 'Assigning...' : 'Assign'}
        </button>
        {message && <p style={{ color: 'var(--muted)' }}>{message}</p>}
      </div>

      <div className="card" style={{ background: 'rgba(2,6,23,0.35)' }}>
        <h3>Uploaded file pairs</h3>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <input className="input" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="Processing">Processing</option>
            <option value="Completed">Completed</option>
          </select>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Filename</th>
                <th>Status</th>
                <th>Uploader</th>
                <th>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file: FilePair) => (
                <tr key={file._id}>
                  <td>{file.baseName}</td>
                  <td>
                    <span className={`badge ${file.status === 'Completed' ? 'completed' : 'processing'}`}>{file.status}</span>
                  </td>
                  <td>{file.uploaderName}</td>
                  <td>{new Date(file.uploadedAt).toLocaleString()}</td>
                </tr>
              ))}
              {files.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                    {filePairsQuery.isFetching ? 'Loading...' : 'No uploads found'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filePagination && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
            <button className="btn secondary" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
              Previous
            </button>
            <span>
              Page {filePagination.page} / {filePagination.pages}
            </span>
            <button className="btn secondary" disabled={filePagination.page >= filePagination.pages} onClick={() => setPage((prev) => prev + 1)}>
              Next
            </button>
          </div>
        )}
      </div>

      <div className="card" style={{ background: 'rgba(2,6,23,0.35)' }}>
        <h3>Assignment log</h3>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <select className="select" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            <option value="">All teams</option>
            <option value="QA1">QA1</option>
            <option value="QA2">QA2</option>
          </select>
          <select className="select" value={qaFilter} onChange={(e) => setQaFilter(e.target.value)}>
            <option value="">All QA members</option>
            {qaUsers.map((user: User) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>File</th>
                <th>QA</th>
                <th>Team</th>
                <th>Assigned By</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((assignment: Assignment) => (
                <tr key={assignment._id}>
                  <td>{assignment.filePair?.baseName}</td>
                  <td>{assignment.assignedToName}</td>
                  <td>{assignment.teamTag}</td>
                  <td>{assignment.assignedByName}</td>
                  <td>{assignment.status}</td>
                  <td>
                     {assignment.status === 'Assigned' && assignment.filePair?.status === 'Processing' && (
                       <button
                         className="btn secondary"
                         onClick={() => {
                           setModalTeam(assignment.teamTag);
                           setModalQa('');
                           setModalFile(assignment.filePair as FilePair);
                           setModalOpen(true);
                           setMessage('');
                         }}
                       >
                         Reassign
                       </button>
                     )}
                  </td>
                </tr>
              ))}
              {assignments.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                    {assignmentsQuery.isFetching ? 'Loading...' : 'No assignments yet'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {assignmentPagination && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
            <button className="btn secondary" disabled={assignmentPage <= 1} onClick={() => setAssignmentPage((prev) => Math.max(1, prev - 1))}>
              Previous
            </button>
            <span>
              Page {assignmentPagination.page} / {assignmentPagination.pages}
            </span>
            <button
              className="btn secondary"
              disabled={assignmentPagination.page >= assignmentPagination.pages}
              onClick={() => setAssignmentPage((prev) => prev + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>
      {modalOpen && modalFile && (
        <div className="modal-overlay">
          <div className="card modal-card">
            <h3 style={{ marginTop: 0 }}>Reassign “{modalFile.baseName}”</h3>
            <p style={{ color: 'var(--muted)', marginTop: 0 }}>
              File is still processing. Choose a QA team and reviewer to reassign.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <select
                className="select"
                value={modalTeam}
                onChange={(e) => {
                  setModalTeam(e.target.value);
                  setModalQa('');
                }}
              >
                <option value="">Select QA team</option>
                <option value="QA1">QA1</option>
                <option value="QA2">QA2</option>
              </select>
              <select className="select" value={modalQa} onChange={(e) => setModalQa(e.target.value)}>
                <option value="">Select QA reviewer</option>
                {modalUsers.map((user: User) => (
                  <option key={user.id} value={user.id}>
                    {user.name} - {user.role}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button className="btn" onClick={handleModalAssign} disabled={assignMutation.isPending}>
                {assignMutation.isPending ? 'Reassigning...' : 'Confirm'}
              </button>
              <button
                className="btn secondary"
                onClick={() => {
                  setModalOpen(false);
                  setModalFile(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerPanel;


