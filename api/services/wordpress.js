"use strict";

const axios = require("axios");
const getDb = require("../db");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");

function getCredentials() {
  const db = getDb();
  const rows = db.prepare(`SELECT key, value FROM app_settings WHERE key IN ('wp_url', 'wp_username', 'wp_password')`).all();
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }

  if (!settings.wp_url || !settings.wp_username || !settings.wp_password) {
    throw new Error("WordPress credentials not configured in settings");
  }

  return {
    url: settings.wp_url.replace(/\/$/, ""), // strip trailing slash
    username: settings.wp_username,
    password: settings.wp_password
  };
}

function getAuthHeader(username, password) {
  const token = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${token}`;
}

async function getPostTypes() {
  const { url, username, password } = getCredentials();
  const res = await axios.get(`${url}/wp-json/wp/v2/types`, {
    headers: { Authorization: getAuthHeader(username, password) }
  });

  // Return post types that are accessible via REST API
  return Object.values(res.data)
    .filter(type => type.rest_base)
    .map(type => ({
      slug: type.slug,
      name: type.name,
      rest_base: type.rest_base
    }));
}

async function getPosts(typeBase) {
  const { url, username, password } = getCredentials();
  const res = await axios.get(`${url}/wp-json/wp/v2/${typeBase}?per_page=100`, {
    headers: { Authorization: getAuthHeader(username, password) }
  });
  return res.data.map(post => ({
    id: post.id,
    title: post.title.rendered,
    link: post.link
  }));
}

async function getMediaForPost(postId) {
  const { url, username, password } = getCredentials();
  const res = await axios.get(`${url}/wp-json/wp/v2/media?parent=${postId}&per_page=100`, {
    headers: { Authorization: getAuthHeader(username, password) }
  });
  return res.data.map(media => ({
    id: media.id,
    title: media.title.rendered,
    source_url: media.source_url,
    mime_type: media.mime_type
  }));
}

async function uploadMedia(filePath, postId, title, alt_text, caption, description) {
  const { url, username, password } = getCredentials();
  const filename = path.basename(filePath);

  // Create stream for file
  const stream = fs.createReadStream(filePath);

  const headers = {
    Authorization: getAuthHeader(username, password),
    'Content-Disposition': `attachment; filename="${filename}"`
  };

  // Upload file
  const res = await axios.post(`${url}/wp-json/wp/v2/media`, stream, { headers });
  const mediaId = res.data.id;

  // Update metadata & attach to post
  const updateData = {
    post: postId
  };

  if (title) updateData.title = title;
  if (alt_text) updateData.alt_text = alt_text;
  if (caption) updateData.caption = caption;
  if (description) updateData.description = description;

  await axios.post(`${url}/wp-json/wp/v2/media/${mediaId}`, updateData, {
    headers: { Authorization: getAuthHeader(username, password), 'Content-Type': 'application/json' }
  });

  return mediaId;
}

async function deleteMedia(mediaId) {
  const { url, username, password } = getCredentials();
  await axios.delete(`${url}/wp-json/wp/v2/media/${mediaId}?force=true`, {
    headers: { Authorization: getAuthHeader(username, password) }
  });
  return true;
}

async function replaceMediaInPost(postId, oldMediaId, newMediaId) {
  const { url, username, password } = getCredentials();
  const auth = getAuthHeader(username, password);

  try {
    await axios.post(`${url}/wp-json/mres/v1/media-studio/swap-media-meta`, {
      post_id: Number(postId),
      old_media_id: Number(oldMediaId),
      new_media_id: Number(newMediaId)
    }, {
      headers: { Authorization: auth, 'Content-Type': 'application/json' }
    });
    console.log(`Successfully swapped media references in post ${postId} from ${oldMediaId} to ${newMediaId}`);
  } catch (err) {
    console.error(`Failed to swap media references for post ${postId}:`, err.message);
  }
  
  return true;
}

module.exports = {
  getPostTypes,
  getPosts,
  getMediaForPost,
  uploadMedia,
  deleteMedia,
  replaceMediaInPost
};
