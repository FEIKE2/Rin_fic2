import { describe, it, expect, mock } from 'bun:test';
import { render } from '@testing-library/react';
import { EditHistoryModal } from '../edit-history-modal';
import type { FeedEditHistory } from '@rin/api';

mock.module('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: any) => {
      if (key === 'edit_history.edited_by') return `Edited by ${params?.username || ''}`;
      return key;
    },
  }),
}));

describe('EditHistoryModal', () => {
  const mockHistory: FeedEditHistory[] = [
    {
      id: 1,
      feedId: 1,
      userId: 1,
      title: 'Old Title 1',
      content: 'Old content 1',
      summary: 'Old summary 1',
      editReason: 'Fixed typos',
      createdAt: '2024-01-01T10:00:00Z',
      user: { id: 1, username: 'testuser', avatar: '/avatar.png' },
    },
    {
      id: 2,
      feedId: 1,
      userId: 1,
      title: 'Old Title 2',
      content: 'Old content 2',
      summary: 'Old summary 2',
      editReason: 'Added content',
      createdAt: '2024-01-02T10:00:00Z',
      user: { id: 1, username: 'testuser', avatar: '/avatar.png' },
    },
  ];

  it('should render loading state', () => {
    const { container } = render(
      <EditHistoryModal isOpen={true} onClose={() => {}} feedId={1} history={[]} loading={true} />
    );
    expect(container.textContent).toContain('edit_history.loading');
  });

  it('should render empty state when no history', () => {
    const { container } = render(
      <EditHistoryModal isOpen={true} onClose={() => {}} feedId={1} history={[]} loading={false} />
    );
    expect(container.textContent).toContain('edit_history.no_history');
  });

  it('should render history list', () => {
    const { container } = render(
      <EditHistoryModal isOpen={true} onClose={() => {}} feedId={1} history={mockHistory} loading={false} />
    );
    expect(container.textContent).toContain('testuser');
    expect(container.textContent).toContain('Fixed typos');
    expect(container.textContent).toContain('Added content');
  });

  it('should not render content when closed', () => {
    const { container } = render(
      <EditHistoryModal isOpen={false} onClose={() => {}} feedId={1} history={mockHistory} loading={false} />
    );
    expect(container.querySelector('.ReactModal__Content')).toBeNull();
  });
});
