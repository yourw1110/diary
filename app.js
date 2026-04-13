import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, query, onSnapshot, deleteDoc, doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDwH1ma8KngQ4T_kAzuwwnjt8PCi7hUZr4",
    authDomain: "monochromediary-68424.firebaseapp.com",
    projectId: "monochromediary-68424",
    storageBucket: "monochromediary-68424.firebasestorage.app",
    messagingSenderId: "819970965803",
    appId: "1:819970965803:web:2c8742886700a969f6856e",
    measurementId: "G-9Q92GCF6L5"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const SECRET_KEY = "2554";

// Register Service Worker for PWA with aggressive update logic
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => {
                console.log('Service Worker registered', reg);
                
                // Track updates
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            console.log('New content is available; please refresh.');
                            // Force update by skipping waiting
                            newWorker.postMessage({ type: 'SKIP_WAITING' });
                        }
                    });
                });
            })
            .catch(err => console.error('Service Worker registration failed', err));
    });

    // Reload when the new service worker takes control
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
            refreshing = true;
            console.log('Service Worker controller changed. Manual refresh may be required for updates.');
            // window.location.reload(); // Disabled to prevent potential loops during transition
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("Diary App v4.0 loaded");
    // UI Elements
    const mainContent = document.querySelector('.main-content');
    const entryForm = document.getElementById('entry-form');
    const entryInput = document.getElementById('entry-input');
    const saveBtn = document.getElementById('save-btn');
    const attachBtn = document.getElementById('attach-btn');
    const imageInput = document.getElementById('image-input');
    const entriesList = document.getElementById('entries-list');
    const currentDateEl = document.getElementById('current-date');
    const previewContainer = document.getElementById('image-preview-container');
    const previewImg = document.getElementById('image-preview');
    const removeImageBtn = document.getElementById('remove-image-btn');

    let currentImageData = null;
    let editingId = null;
    let unsubscribe = null;

    const checkKey = () => {
        const key = window.prompt("4桁のキーを入力してください");
        if (key === SECRET_KEY) return true;
        alert("キーが間違っています。");
        return false;
    };

    // Set current date
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    currentDateEl.textContent = new Date().toLocaleDateString('en-US', dateOptions);

    startListeningEntries();

    // Handle Image Attachment
    attachBtn.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                attachBtn.disabled = true;
                attachBtn.textContent = 'Processing...';
                saveBtn.disabled = true;

                const reader = new FileReader();
                const imageData = await new Promise((resolve, reject) => {
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = (e) => reject(new Error("File reading failed"));
                    reader.readAsDataURL(file);
                });

                // Resize immediately to keep memory usage low and prevent hangs
                currentImageData = await resizeImage(imageData, 800, 800);
                previewImg.src = currentImageData;
                previewContainer.classList.remove('hidden');
            } catch (error) {
                console.error("Image processing failed:", error);
                alert("Failed to process image. It might be too large for this browser.");
                imageInput.value = '';
            } finally {
                attachBtn.disabled = false;
                attachBtn.textContent = 'Add Image';
                saveBtn.disabled = false;
            }
        }
    });

    removeImageBtn.addEventListener('click', () => {
        currentImageData = null;
        imageInput.value = '';
        previewContainer.classList.add('hidden');
    });

    function startListeningEntries() {
        // Removed orderBy to avoid composite index requirement
        const q = query(
            collection(db, "entries")
        );

        unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
            const entries = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data({ serverTimestamps: 'estimate' })
            }));

            // Client-side sort by timestamp descending
            entries.sort((a, b) => {
                const timeA = a.timestamp?.toMillis?.() || Date.now();
                const timeB = b.timestamp?.toMillis?.() || Date.now();
                return timeB - timeA;
            });
            renderEntries(entries);
        }, (error) => {
            console.error("Listener failed:", error);
        });
    }

    // Save/Update Entry (Form Submit)
    entryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!checkKey()) return;
        
        const content = entryInput.value.trim();
        if (!content && !currentImageData) return;

        // Optimistic UI: Clear form immediately
        const backupContent = content;
        const backupImage = currentImageData;
        const isEditing = !!editingId;
        const targetId = editingId;
        resetForm();

        try {
            console.log("Saving entry...", { isEditing, targetId });

            if (isEditing) {
                await updateDoc(doc(db, "entries", targetId), {
                    content: backupContent,
                    image: backupImage,
                    // stop updating timestamp: serverTimestamp() to retain original position
                    updatedAtString: new Date().toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    })
                });
            } else {
                await addDoc(collection(db, "entries"), {
                    content: backupContent,
                    image: backupImage,
                    timestamp: serverTimestamp(),
                    dateString: new Date().toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    })
                });
            }
            console.log("Entry saved successfully");
        } catch (error) {
            console.error("Error saving entry:", error);
            alert(`[v2.1] Failed to save entry: ${error.message}\n(Code: ${error.code})`);
            // Restore form if failed
            entryInput.value = backupContent;
            currentImageData = backupImage;
            if (currentImageData) {
                previewImg.src = currentImageData;
                previewContainer.classList.remove('hidden');
            }
            editingId = targetId;
            saveBtn.textContent = isEditing ? 'Update Entry' : 'Save Entry';
        }
    });

    async function resizeImage(base64Str, maxWidth, maxHeight) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = base64Str;
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > maxWidth) {
                            height *= maxWidth / width;
                            width = maxWidth;
                        }
                    } else {
                        if (height > maxHeight) {
                            width *= maxHeight / height;
                            height = maxHeight;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.7)); // Moderate compression
                } catch (e) {
                    reject(e);
                }
            };
            img.onerror = () => reject(new Error("Failed to load image for resizing"));
        });
    }

    function resetForm() {
        entryInput.value = '';
        currentImageData = null;
        imageInput.value = '';
        previewContainer.classList.add('hidden');
        saveBtn.textContent = 'Save Entry';
        editingId = null;
    }

    function renderEntries(entries) {
        entriesList.innerHTML = '';
        entries.forEach(entry => {
            const entryEl = document.createElement('div');
            entryEl.className = 'diary-entry';
            entryEl.innerHTML = `
                <div class="entry-header">
                    <div class="entry-date-container">
                        <div class="entry-date">${entry.dateString || new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                        ${entry.updatedAtString ? `<div class="edited-label">Edited: ${entry.updatedAtString}</div>` : ''}
                    </div>
                    <div class="entry-actions">
                        <button class="comment-btn" data-id="${entry.id}">Comment</button>
                        <button class="edit-btn" data-id="${entry.id}">Edit</button>
                        <button class="delete-btn" data-id="${entry.id}">Delete</button>
                    </div>
                </div>
                <div class="entry-content">${escapeHTML(entry.content)}</div>
                ${entry.image ? `<img src="${entry.image}" class="entry-image" alt="Attached image">` : ''}
                
                <div class="comments-section" id="comments-${entry.id}">
                    ${(entry.comments || []).map((comment, index) => {
                        if (!comment || typeof comment.text === 'undefined') return '';
                        return `
                        <div class="comment-item" data-index="${index}">
                            <div class="comment-header">
                                <div class="comment-date">${comment.dateString || ''}</div>
                                <div class="comment-actions">
                                    <button class="edit-comment-btn" data-entry-id="${entry.id}" data-index="${index}">Edit</button>
                                    <button class="delete-comment-btn" data-entry-id="${entry.id}" data-index="${index}">Delete</button>
                                </div>
                            </div>
                            <div class="comment-text">${escapeHTML(comment.text)}</div>
                            
                            <form class="comment-edit-form hidden" data-entry-id="${entry.id}" data-index="${index}">
                                <textarea class="comment-edit-input">${escapeHTML(comment.text)}</textarea>
                                <div class="comment-edit-actions">
                                    <button type="submit" class="save-comment-btn small-btn">Save</button>
                                    <button type="button" class="cancel-edit-comment-btn small-btn secondary-btn">Cancel</button>
                                </div>
                            </form>
                        </div>
                    `}).join('')}
                </div>

                <form class="comment-form hidden" id="comment-form-${entry.id}">
                    <textarea class="comment-input" placeholder="Add a comment..."></textarea>
                    <div class="comment-form-actions">
                        <button type="submit" class="submit-comment-btn small-btn" data-id="${entry.id}">Post</button>
                        <button type="button" class="cancel-comment-btn small-btn secondary-btn" data-id="${entry.id}">Cancel</button>
                    </div>
                </form>
            `;
            entriesList.appendChild(entryEl);

            // Add button listeners
            entryEl.querySelector('.delete-btn').addEventListener('click', async () => {
                if (!checkKey()) return;
                if (window.confirm('Delete this entry?')) {
                    await deleteDoc(doc(db, "entries", entry.id));
                }
            });

            entryEl.querySelector('.edit-btn').addEventListener('click', () => {
                editingId = entry.id;
                entryInput.value = entry.content || '';
                currentImageData = entry.image;
                if (currentImageData) {
                    previewImg.src = currentImageData;
                    previewContainer.classList.remove('hidden');
                } else {
                    previewContainer.classList.add('hidden');
                }
                saveBtn.textContent = 'Update Entry';
                window.scrollTo({ top: 0, behavior: 'smooth' });
                entryInput.focus();
            });

            entryEl.querySelector('.comment-btn').addEventListener('click', () => {
                const form = document.getElementById(`comment-form-${entry.id}`);
                form.classList.toggle('hidden');
                // Hide any open edit forms when opening the main comment form
                entryEl.querySelectorAll('.comment-edit-form').forEach(f => f.classList.add('hidden'));
                entryEl.querySelectorAll('.comment-text').forEach(t => t.classList.remove('hidden'));
                
                if (!form.classList.contains('hidden')) {
                    form.querySelector('.comment-input').focus();
                }
            });

            entryEl.querySelector('.cancel-comment-btn').addEventListener('click', () => {
                const form = document.getElementById(`comment-form-${entry.id}`);
                form.classList.add('hidden');
                form.querySelector('.comment-input').value = '';
            });

            // Comment actions (Edit/Delete)
            entryEl.querySelectorAll('.delete-comment-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!checkKey()) return;
                    if (!window.confirm('Delete this comment?')) return;
                    const index = parseInt(btn.dataset.index);
                    const updatedComments = [...entry.comments];
                    updatedComments.splice(index, 1);
                    
                    try {
                        await updateDoc(doc(db, "entries", entry.id), { comments: updatedComments });
                    } catch (error) {
                        console.error("Error deleting comment:", error);
                        alert("Failed to delete comment.");
                    }
                });
            });

            entryEl.querySelectorAll('.edit-comment-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const index = btn.dataset.index;
                    const item = entryEl.querySelector(`.comment-item[data-index="${index}"]`);
                    const text = item.querySelector('.comment-text');
                    const form = item.querySelector('.comment-edit-form');
                    
                    text.classList.add('hidden');
                    form.classList.remove('hidden');
                    form.querySelector('.comment-edit-input').focus();
                });
            });

            entryEl.querySelectorAll('.cancel-edit-comment-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const item = btn.closest('.comment-item');
                    item.querySelector('.comment-text').classList.remove('hidden');
                    item.querySelector('.comment-edit-form').classList.add('hidden');
                });
            });

            entryEl.querySelectorAll('.comment-edit-form').forEach(form => {
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    if (!checkKey()) return;
                    const index = parseInt(form.dataset.index);
                    const input = form.querySelector('.comment-edit-input');
                    const text = input.value.trim();
                    if (!text) return;

                    const updatedComments = [...entry.comments];
                    updatedComments[index] = {
                        ...updatedComments[index],
                        text,
                        updatedAt: Date.now()
                    };

                    try {
                        await updateDoc(doc(db, "entries", entry.id), { comments: updatedComments });
                    } catch (error) {
                        console.error("Error updating comment:", error);
                        alert("Failed to update comment.");
                    }
                });
            });

            entryEl.querySelector('.comment-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                if (!checkKey()) return;
                const form = e.target;
                const input = form.querySelector('.comment-input');
                const text = input.value.trim();
                if (!text) return;

                const newComment = {
                    text,
                    dateString: new Date().toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    }),
                    timestamp: Date.now()
                };

                const updatedComments = [...(entry.comments || []), newComment];

                try {
                    await updateDoc(doc(db, "entries", entry.id), {
                        comments: updatedComments
                    });
                    input.value = '';
                    form.classList.add('hidden');
                } catch (error) {
                    console.error("Error adding comment:", error);
                    alert("Failed to add comment.");
                }
            });
        });
    }

    function escapeHTML(str) {
        if (!str) return '';
        const p = document.createElement('p');
        p.textContent = str;
        return p.innerHTML;
    }
});
