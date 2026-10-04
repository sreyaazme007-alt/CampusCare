(() => {
    const config = window.CAMPUSCARE_SUPABASE;
    let client;

    function getClient() {
        if (!config || config.url.includes("YOUR_") || config.anonKey.includes("YOUR_")) {
            throw new Error("Add your Supabase project URL and anon key to supabase-config.js.");
        }
        if (!client) {
            client = window.supabase.createClient(config.url, config.anonKey);
        }
        return client;
    }

    function showMessage(element, message, isError = false) {
        element.textContent = message;
        element.style.display = "block";
        element.style.color = isError ? "#991b1b" : "#166534";
        element.style.background = isError ? "#fee2e2" : "#dcfce7";
        element.setAttribute("role", isError ? "alert" : "status");
    }

    function formatDate(value) {
        return new Date(value).toLocaleDateString(undefined, {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    }

    async function uploadEvidence(supabase, complaintId, file) {
        if (!file) return null;
        if (file.size > 5 * 1024 * 1024) {
            throw new Error("Choose an image smaller than 5 MB.");
        }
        const extension = file.name.split(".").pop().toLowerCase();
        const path = `${complaintId}/${crypto.randomUUID()}.${extension}`;
        const { error } = await supabase.storage
            .from("complaint-evidence")
            .upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw error;
        return path;
    }

    async function handleComplaintForm() {
        const form = document.getElementById("complaintForm");
        if (!form) return;

        const message = document.getElementById("successMessage");
        const button = form.querySelector('[type="submit"]');
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            button.disabled = true;
            message.style.display = "none";
            try {
                const supabase = getClient();
                const role = document.body.dataset.role;
                const complaintId = crypto.randomUUID();
                const value = (id) => document.getElementById(id)?.value.trim() || null;
                const imagePath = await uploadEvidence(
                    supabase,
                    complaintId,
                    document.getElementById("image").files[0]
                );
                const { error } = await supabase.from("complaints").insert({
                    id: complaintId,
                    role,
                    name: value("name"),
                    identifier: value("registerNumber") || value("employeeId"),
                    department: value("department"),
                    semester: value("semester"),
                    class_name: value("className"),
                    designation: value("designation"),
                    phone: value("phone"),
                    category: value("category"),
                    description: value("description"),
                    image_path: imagePath
                });
                if (error) throw error;
                form.reset();
                showMessage(message, `Complaint submitted. Save this tracking ID: ${complaintId}`);
            } catch (error) {
                showMessage(message, error.message || "Could not submit your complaint.", true);
            } finally {
                button.disabled = false;
            }
        });
    }

    async function handleTrackingForm() {
        const form = document.getElementById("trackForm");
        if (!form) return;

        const feedbackBox = document.getElementById("feedbackBox");
        const feedbackRating = document.getElementById("feedbackRating");
        const feedbackText = document.getElementById("feedbackText");
        const feedbackMessage = document.getElementById("feedbackMessage");
        const feedbackButton = document.getElementById("submitFeedback");

        const saveFeedback = async () => {
            const complaintId = document.getElementById("complaintId").value.trim();
            if (!complaintId) return;
            const supabase = getClient();
            const { error } = await supabase.from("complaint_feedback").insert({
                complaint_id: complaintId,
                rating: feedbackRating.value,
                comment: feedbackText.value.trim() || null
            });
            if (error) {
                feedbackMessage.textContent = error.message || "Could not save feedback.";
                feedbackMessage.style.display = "block";
                return;
            }
            feedbackMessage.textContent = "Feedback saved successfully.";
            feedbackMessage.style.display = "block";
        };

        feedbackButton.addEventListener("click", saveFeedback);

        const linkedId = new URLSearchParams(window.location.search).get("id");
        if (linkedId) document.getElementById("complaintId").value = linkedId;

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const result = document.getElementById("result");
            const errorMessage = document.getElementById("errorMessage");
            result.style.display = "none";
            errorMessage.style.display = "none";
            feedbackBox.style.display = "none";
            feedbackMessage.style.display = "none";
            try {
                const { data, error } = await getClient().rpc("track_complaint", {
                    complaint_id_input: document.getElementById("complaintId").value.trim()
                });
                if (error) throw error;
                if (!data?.length) {
                    errorMessage.textContent = "Complaint not found. Check the tracking ID and try again.";
                    errorMessage.style.display = "block";
                    return;
                }
                const complaint = data[0];
                document.getElementById("displayId").textContent = complaint.complaint_id;
                document.getElementById("displayCategory").textContent = complaint.category;
                document.getElementById("displayDate").textContent = formatDate(complaint.submitted_at);
                document.getElementById("displayStatus").textContent = complaint.status;
                document.getElementById("displayUpdated").textContent = formatDate(complaint.updated_at);
                result.style.display = "block";

                if (complaint.status === "Resolved") {
                    feedbackBox.style.display = "block";
                }
            } catch (error) {
                errorMessage.textContent = error.message || "Could not look up this complaint.";
                errorMessage.style.display = "block";
            }
        });
    }

    async function handleLoginForm() {
        const form = document.getElementById("loginForm");
        if (!form) return;

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const errorMessage = document.getElementById("errorMessage");
            const button = form.querySelector('[type="submit"]');
            errorMessage.style.display = "none";
            button.disabled = true;
            try {
                const supabase = getClient();
                const { error } = await supabase.auth.signInWithPassword({
                    email: document.getElementById("username").value.trim(),
                    password: document.getElementById("password").value
                });
                if (error) throw error;
                const { data, error: roleError } = await supabase.rpc("is_authority");
                if (roleError) throw roleError;
                if (!data) {
                    await supabase.auth.signOut();
                    throw new Error("This account is not enabled for authority access.");
                }
                window.location.href = "authority-dashboard.html";
            } catch (error) {
                showMessage(errorMessage, error.message || "Could not sign in.", true);
            } finally {
                button.disabled = false;
            }
        });
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (character) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[character]);
    }

    async function handleComplaintDetails() {
        const form = document.getElementById("updateForm");
        if (!form) return;

        const message = document.getElementById("successMessage");
        const details = document.querySelectorAll(".details-grid .detail-value");
        const complaintId = new URLSearchParams(window.location.search).get("id");
        window.goBack = () => window.location.href = complaintId
            ? "authority-dashboard.html"
            : "index.html";

        if (!complaintId) {
            const pageTitle = document.querySelector(".page-title");
            pageTitle.querySelector("h1").textContent = "Resolved Complaints";
            pageTitle.querySelector("p").textContent = "Recently resolved campus issues";
            document.querySelectorAll(".main > .card").forEach((card) => card.style.display = "none");

            const list = document.createElement("section");
            list.className = "card";
            list.style.display = "block";
            list.innerHTML = "<h2>Resolved Complaints</h2><p>Loading complaints...</p>";
            pageTitle.after(list);
            try {
                const { data, error } = await getClient().rpc("list_resolved_complaints");
                if (error) throw error;
                if (!data.length) {
                    list.innerHTML = "<h2>Resolved Complaints</h2><div class='empty-state'>No completed complaints have been submitted yet.</div>";
                } else {
                    list.innerHTML = `<h2>Resolved Complaints</h2>
                        <div class="feedback-card">
                            <form class="feedback-form" id="resolvedFeedbackForm">
                                <div class="field-group">
                                    <label for="resolvedComplaintId">Complaint ID</label>
                                    <select id="resolvedComplaintId">${data.map((complaint) => `
                                        <option value="${escapeHtml(complaint.complaint_id)}">${escapeHtml(complaint.complaint_id)}</option>
                                    `).join("")}</select>
                                </div>

                                <div class="field-group">
                                    <label>Current Status</label>
                                    <div class="status-pill">Resolved</div>
                                </div>

                                <div class="field-group">
                                    <label for="resolvedCategory">Category</label>
                                    <input id="resolvedCategory" value="${escapeHtml(data[0].category || "")}" readonly>
                                </div>

                                <div class="field-group">
                                    <label for="resolvedRemarks">Authority Remarks</label>
                                    <textarea id="resolvedRemarks" readonly>${escapeHtml(data[0].authority_remarks || "No remarks provided.")}</textarea>
                                </div>

                                <div class="field-group">
                                    <label for="resolvedRating">How satisfied are you?</label>
                                    <select id="resolvedRating">
                                        <option value="Very Satisfied">Very Satisfied</option>
                                        <option value="Satisfied">Satisfied</option>
                                        <option value="Neutral">Neutral</option>
                                        <option value="Needs Improvement">Needs Improvement</option>
                                    </select>
                                </div>

                                <div class="field-group">
                                    <label for="resolvedFeedback">Your feedback</label>
                                    <textarea id="resolvedFeedback" placeholder="Tell us how we handled your complaint..."></textarea>
                                </div>

                                <button type="submit">Submit Feedback</button>
                            </form>

                            <div style="margin-top:22px; border-top:1px solid #e2e8f0; padding-top:18px;">
                                <h3 style="margin-bottom:12px; color:#1e293b;">Received Feedback</h3>
                                <div id="feedbackPreview" style="display:grid; gap:12px;"></div>
                            </div>
                        </div>`;

                    const resolvedFeedbackForm = document.getElementById("resolvedFeedbackForm");
                    const resolvedComplaintId = document.getElementById("resolvedComplaintId");
                    const resolvedCategory = document.getElementById("resolvedCategory");
                    const resolvedRemarks = document.getElementById("resolvedRemarks");
                    const feedbackPreview = document.getElementById("feedbackPreview");

                    const renderFeedbackPreview = async (complaintId) => {
                        const { data: feedbackRows, error } = await getClient()
                            .from("complaint_feedback")
                            .select("*")
                            .eq("complaint_id", complaintId)
                            .order("created_at", { ascending: false });

                        if (error) {
                            feedbackPreview.innerHTML = `<div class="empty-state">Unable to load feedback: ${escapeHtml(error.message || "Unknown database error")}</div>`;
                            return;
                        }

                        if (!feedbackRows.length) {
                            feedbackPreview.innerHTML = `<div class="empty-state">No feedback submitted for this complaint yet.</div>`;
                            return;
                        }

                        feedbackPreview.innerHTML = feedbackRows.map((feedback) => `
                            <div style="padding:12px 14px; border:1px solid #e2e8f0; border-radius:10px; background:#f8fafc;">
                                <div style="font-weight:700; margin-bottom:6px;">Rating: ${escapeHtml(feedback.rating)}</div>
                                <div style="color:#475569; margin-bottom:6px;">${escapeHtml(feedback.comment || "No comment provided.")}</div>
                                <div style="font-size:12px; color:#64748b;">Submitted: ${formatDate(feedback.created_at)}</div>
                            </div>
                        `).join("");
                    };

                    const applySelectedComplaint = async () => {
                        const selected = data.find((complaint) => complaint.complaint_id === resolvedComplaintId.value) || data[0];
                        resolvedCategory.value = selected.category || "";
                        resolvedRemarks.value = selected.authority_remarks || "No remarks provided.";
                        await renderFeedbackPreview(selected.complaint_id);
                    };

                    resolvedComplaintId.addEventListener("change", applySelectedComplaint);
                    resolvedFeedbackForm.addEventListener("submit", async (event) => {
                        event.preventDefault();
                        const complaintId = resolvedComplaintId.value;
                        const rating = document.getElementById("resolvedRating").value;
                        const comment = document.getElementById("resolvedFeedback").value.trim() || null;

                        const { error } = await getClient().from("complaint_feedback").insert({
                            complaint_id: complaintId,
                            rating,
                            comment
                        });
                        if (error) {
                            alert(error.message || "Could not save feedback.");
                            return;
                        }

                        document.getElementById("resolvedFeedback").value = "";
                        await renderFeedbackPreview(complaintId);
                        const current = document.getElementById("resolvedRating");
                        if (current) {
                            current.selectedIndex = 0;
                        }
                        alert("Thank you for your feedback.");
                    });

                    applySelectedComplaint();
                }
            } catch (error) {
                list.innerHTML = `<h2>Resolved Complaints</h2><p>${escapeHtml(error.message || "Could not load resolved complaints.")}</p>`;
            }
            return;
        }

        try {
            const supabase = getClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                window.location.replace("authority-login.html");
                return;
            }
            const { data: isAuthority, error: roleError } = await supabase.rpc("is_authority");
            if (roleError || !isAuthority) {
                window.location.replace("authority-login.html");
                return;
            }
            const { data: complaint, error } = await supabase.from("complaints")
                .select("*").eq("id", complaintId).single();
            if (error) throw error;

            [
                complaint.id,
                complaint.role,
                complaint.category,
                formatDate(complaint.created_at),
                complaint.status,
                formatDate(complaint.updated_at)
            ].forEach((value, index) => {
                if (index === 4) details[index].querySelector(".current-status").textContent = value;
                else details[index].textContent = value || "Not provided";
            });
            [
                complaint.name,
                complaint.identifier,
                complaint.department,
                complaint.semester,
                complaint.class_name,
                complaint.phone
            ].forEach((value, index) => {
                details[index + 6].textContent = value || "Not provided";
            });
            document.querySelector(".description").textContent = complaint.description;
            document.getElementById("status").value = complaint.status;
            document.getElementById("remarks").value = complaint.authority_remarks || "";

            if (complaint.image_path) {
                const { data: image, error: imageError } = await supabase.storage
                    .from("complaint-evidence").createSignedUrl(complaint.image_path, 60);
                if (imageError) throw imageError;
                const imageElement = document.createElement("img");
                imageElement.src = image.signedUrl;
                imageElement.alt = "Evidence uploaded with the complaint";
                imageElement.style.maxWidth = "100%";
                document.querySelector(".image-box").replaceChildren(imageElement);
            }

            document.querySelectorAll(".main > .card").forEach((card) => card.style.display = "block");

            const feedbackSummary = document.getElementById("feedbackSummary");
            const { data: feedbackRows, error: feedbackError } = await supabase.from("complaint_feedback")
                .select("*")
                .eq("complaint_id", complaint.id)
                .order("created_at", { ascending: false });
            if (feedbackError) {
                feedbackSummary.textContent = "Unable to load feedback.";
            } else if (!feedbackRows.length) {
                feedbackSummary.textContent = "No user feedback submitted for this complaint yet.";
            } else {
                feedbackSummary.innerHTML = feedbackRows.map((feedback) => `
                    <div style="padding:12px 0;border-bottom:1px solid #e2e8f0;">
                        <div style="font-weight:700;margin-bottom:6px;">Rating: ${escapeHtml(feedback.rating)}</div>
                        <div style="color:#475569;margin-bottom:6px;">${escapeHtml(feedback.comment || "No comment provided.")}</div>
                        <div style="font-size:12px;color:#64748b;">Submitted: ${formatDate(feedback.created_at)}</div>
                    </div>
                `).join("");
            }

            form.addEventListener("submit", async (event) => {
                event.preventDefault();
                const { error: updateError } = await supabase.from("complaints").update({
                    status: document.getElementById("status").value,
                    authority_remarks: document.getElementById("remarks").value.trim() || null,
                    updated_at: new Date().toISOString()
                }).eq("id", complaint.id);
                if (updateError) {
                    showMessage(message, updateError.message, true);
                    return;
                }
                showMessage(message, "Complaint updated successfully.");
            });
        } catch (error) {
            showMessage(message, error.message || "Could not load this complaint.", true);
            document.querySelector(".page-title p").textContent = error.message || "Could not load this complaint.";
        }
    }

    async function handleDashboard() {
        const tableBody = document.getElementById("complaintTable");
        if (!tableBody) return;

        const supabase = getClient();
        const complaints = [];
        let selectedComplaint = null;
        const statusClass = (status) => ({
            "Pending": "pending", "In Progress": "progress", "Resolved": "resolved"
        })[status] || "";

        function renderTable() {
            const search = document.getElementById("searchInput").value.trim().toLowerCase();
            const status = document.getElementById("statusFilter").value;
            const category = document.getElementById("categoryFilter").value;
            const filtered = complaints.filter((complaint) =>
                complaint.id.toLowerCase().includes(search) &&
                (status === "All" || complaint.status === status) &&
                (category === "All" || complaint.category === category)
            );
            tableBody.innerHTML = filtered.length ? filtered.map((complaint) => `
                <tr>
                    <td>${escapeHtml(complaint.id)}</td>
                    <td>${escapeHtml(complaint.role)}</td>
                    <td>${escapeHtml(complaint.category)}</td>
                    <td>${formatDate(complaint.created_at)}</td>
                    <td><span class="status ${statusClass(complaint.status)}">${escapeHtml(complaint.status)}</span></td>
                    <td><button class="view-btn" data-complaint-id="${escapeHtml(complaint.id)}">View</button></td>
                </tr>
            `).join("") : '<tr><td colspan="6" style="text-align:center;padding:20px;">No complaints found.</td></tr>';
            tableBody.querySelectorAll("[data-complaint-id]").forEach((button) => {
                button.addEventListener("click", () => viewComplaint(button.dataset.complaintId));
            });
        }

        function updateStatistics() {
            const count = (status) => complaints.filter((complaint) => complaint.status === status).length;
            document.getElementById("totalCount").textContent = complaints.length;
            document.getElementById("pendingCount").textContent = count("Pending");
            document.getElementById("progressCount").textContent = count("In Progress");
            document.getElementById("resolvedCount").textContent = count("Resolved");
            document.getElementById("alertText").textContent = count("Pending")
                ? `${count("Pending")} new complaints require attention.`
                : "No new complaints require attention.";
        }

        function viewComplaint(complaintId) {
            selectedComplaint = complaints.find((complaint) => complaint.id === complaintId);
            if (!selectedComplaint) return;
            document.getElementById("detailId").textContent = selectedComplaint.id;
            document.getElementById("detailName").textContent = selectedComplaint.name;
            document.getElementById("detailRole").textContent = selectedComplaint.role;
            document.getElementById("detailCategory").textContent = selectedComplaint.category;
            document.getElementById("detailPhone").textContent = selectedComplaint.phone;
            document.getElementById("detailDate").textContent = formatDate(selectedComplaint.created_at);
            document.getElementById("detailDescription").textContent = selectedComplaint.description;
            document.getElementById("newStatus").value = selectedComplaint.status;
            document.getElementById("complaintModal").style.display = "flex";
        }

        window.filterComplaints = renderTable;
        window.closeModal = () => {
            document.getElementById("complaintModal").style.display = "none";
        };
        window.updateStatus = async () => {
            if (!selectedComplaint) return;
            const nextStatus = document.getElementById("newStatus").value;
            const { error } = await supabase.from("complaints")
                .update({ status: nextStatus, updated_at: new Date().toISOString() })
                .eq("id", selectedComplaint.id);
            if (error) {
                alert(error.message);
                return;
            }
            selectedComplaint.status = nextStatus;
            selectedComplaint.updated_at = new Date().toISOString();
            window.closeModal();
            renderTable();
            updateStatistics();
        };
        window.logout = async () => {
            if (!confirm("Are you sure you want to logout?")) return;
            await supabase.auth.signOut();
            window.location.href = "authority-login.html";
        };
        document.getElementById("complaintModal").addEventListener("click", (event) => {
            if (event.target === event.currentTarget) window.closeModal();
        });
        document.getElementById("searchInput").addEventListener("input", renderTable);
        document.getElementById("statusFilter").addEventListener("change", renderTable);
        document.getElementById("categoryFilter").addEventListener("change", renderTable);
        document.getElementById("openFullDetails").addEventListener("click", () => {
            if (selectedComplaint) {
                window.location.href = `Complaint-details.html?id=${encodeURIComponent(selectedComplaint.id)}`;
            }
        });

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                window.location.replace("authority-login.html");
                return;
            }
            const { data: isAuthority, error: roleError } = await supabase.rpc("is_authority");
            if (roleError || !isAuthority) {
                await supabase.auth.signOut();
                window.location.replace("authority-login.html");
                return;
            }
            const { data, error } = await supabase.from("complaints").select("*").order("created_at", { ascending: false });
            if (error) throw error;
            complaints.length = 0;
            complaints.push(...data);
            window.__campuscareComplaints = complaints;
            renderTable();
            updateStatistics();
        } catch (error) {
            document.getElementById("alertText").textContent = error.message || "Could not load complaints.";
        }
    }

    handleComplaintForm();
    handleTrackingForm();
    handleLoginForm();
    handleComplaintDetails().catch((error) => {
        const message = document.getElementById("successMessage");
        if (message) showMessage(message, error.message || "Could not load complaint details.", true);
    });
    handleDashboard().catch((error) => {
        const alertText = document.getElementById("alertText");
        if (alertText) alertText.textContent = error.message || "Could not initialize the dashboard.";
    });
})();
