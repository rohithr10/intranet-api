import { ActivityLog } from '../models/ActivityLog.js';
import { ApplicationOption } from '../models/ApplicationOption.js';
import { Content } from '../models/Content.js';
import { Media } from '../models/Media.js';
import { News } from '../models/News.js';
import { Role } from '../models/Role.js';
import { Service } from '../models/Service.js';
import { Tag } from '../models/Tag.js';
import { User } from '../models/User.js';

/**
 * Every figure on the dashboard comes from a count or aggregation here —
 * nothing on that screen is a literal in the frontend.
 */
export async function getDashboardStats() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    activeUsers,
    totalServices,
    enabledServices,
    publishedNews,
    draftNews,
    scheduledNews,
    publishedContent,
    draftContent,
    totalTags,
    totalMedia,
    totalRoles,
    totalOptions,
    newUsersThisWeek,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ status: 'active' }),
    Service.countDocuments(),
    Service.countDocuments({ status: 'enabled' }),
    News.countDocuments({ status: 'published' }),
    News.countDocuments({ status: 'draft' }),
    News.countDocuments({ status: 'scheduled' }),
    Content.countDocuments({ status: 'published' }),
    Content.countDocuments({ status: 'draft' }),
    Tag.countDocuments(),
    Media.countDocuments(),
    Role.countDocuments(),
    ApplicationOption.countDocuments(),
    User.countDocuments({ createdAt: { $gte: since } }),
  ]);

  return {
    users: { total: totalUsers, active: activeUsers, inactive: totalUsers - activeUsers, newThisWeek: newUsersThisWeek },
    services: { total: totalServices, enabled: enabledServices, disabled: totalServices - enabledServices },
    news: { published: publishedNews, draft: draftNews, scheduled: scheduledNews },
    content: { published: publishedContent, draft: draftContent, total: publishedContent + draftContent },
    library: { tags: totalTags, media: totalMedia },
    system: { roles: totalRoles, options: totalOptions },
  };
}

/** The "recently created content" panel: newest news and content interleaved. */
export async function getRecentContent(limit = 6) {
  const [news, content] = await Promise.all([
    News.find()
      .select('title slug status publishedAt createdAt author')
      .populate('author', 'name')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
    Content.find()
      .select('title slug status category publishedAt createdAt author')
      .populate('author', 'name')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
  ]);

  const items = [
    ...news.map((n) => ({
      id: String(n._id),
      type: 'news' as const,
      title: n.title,
      slug: n.slug,
      status: n.status,
      category: '',
      author: (n.author as { name?: string } | null)?.name ?? '',
      createdAt: n.createdAt,
    })),
    ...content.map((c) => ({
      id: String(c._id),
      type: 'content' as const,
      title: c.title,
      slug: c.slug,
      status: c.status,
      category: c.category ?? '',
      author: (c.author as { name?: string } | null)?.name ?? '',
      createdAt: c.createdAt,
    })),
  ];

  return items
    .sort((a, b) => new Date(b.createdAt as Date).getTime() - new Date(a.createdAt as Date).getTime())
    .slice(0, limit);
}

/** The "recent administrative activity" feed. */
export async function getRecentActivity(limit = 8) {
  const entries = await ActivityLog.find()
    .populate('actor', 'name email')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return entries.map((entry) => ({
    id: String(entry._id),
    action: entry.action,
    description: entry.description,
    entity: entry.entity,
    status: entry.status,
    actor: (entry.actor as { name?: string } | null)?.name ?? entry.actorEmail ?? 'System',
    createdAt: entry.createdAt,
  }));
}
