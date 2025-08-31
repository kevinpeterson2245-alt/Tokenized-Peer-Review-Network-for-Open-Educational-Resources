;; resource-registry.clar
;; Core smart contract for registering Open Educational Resources (OER) on the Stacks blockchain.
;; This contract handles submission, uniqueness checks, metadata storage, and immutable timestamping.
;; It serves as the foundation for the peer-review network, ensuring resources are verifiable and owned.
;; Extended with features for versioning, categorization, collaboration, status updates, licensing, and revenue sharing to make it robust.

;; Constants
(define-constant ERR-ALREADY-REGISTERED u100)
(define-constant ERR-NOT-OWNER u101)
(define-constant ERR-INVALID-HASH u102)
(define-constant ERR-INVALID-METADATA u103)
(define-constant ERR-UNAUTHORIZED u104)
(define-constant ERR-PAUSED u105)
(define-constant ERR-INVALID-VERSION u106)
(define-constant ERR-INVALID-LICENSEE u107)
(define-constant ERR-INVALID-CATEGORY u108)
(define-constant ERR-INVALID-COLLABORATOR u109)
(define-constant ERR-INVALID-STATUS u110)
(define-constant ERR-INVALID-SHARE u111)
(define-constant ERR-MAX-LENGTH-EXCEEDED u112)
(define-constant MAX-TITLE-LEN u100)
(define-constant MAX-DESC-LEN u1000)
(define-constant MAX-TAGS u10)
(define-constant MAX-PERMISSIONS u5)
(define-constant MAX-UPDATE-NOTES-LEN u500)
(define-constant MAX-TERMS-LEN u500)
(define-constant MAX-ROLE-LEN u50)
(define-constant MAX-CATEGORY-LEN u50)
(define-constant MAX-TAG-LEN u20)
(define-constant MAX-PERM-LEN u20)
(define-constant MAX-STATUS-LEN u20)

;; Data Variables
(define-data-var contract-paused bool false)
(define-data-var contract-admin principal tx-sender)
(define-data-var total-resources uint u0)

;; Data Maps
(define-map resource-registry
  { resource-hash: (buff 32) }  ;; Unique IPFS content hash
  {
    creator: principal,
    timestamp: uint,
    title: (string-utf8 100),
    description: (string-utf8 1000),
    ipfs-hash: (buff 46)  ;; CID for IPFS
  }
)

(define-map resource-versions
  { resource-hash: (buff 32), version: uint }
  {
    updated-ipfs-hash: (buff 46),
    update-notes: (string-utf8 500),
    timestamp: uint
  }
)

(define-map resource-categories
  { resource-hash: (buff 32) }
  {
    category: (string-utf8 50),
    tags: (list 10 (string-utf8 20))
  }
)

(define-map resource-collaborators
  { resource-hash: (buff 32), collaborator: principal }
  {
    role: (string-utf8 50),
    permissions: (list 5 (string-utf8 20)),
    added-at: uint
  }
)

(define-map resource-status
  { resource-hash: (buff 32) }
  {
    status: (string-utf8 20),  ;; e.g., "draft", "submitted", "reviewed", "approved"
    visibility: bool,  ;; public or private
    last-updated: uint
  }
)

(define-map resource-licenses
  { resource-hash: (buff 32), licensee: principal }
  {
    expiry: uint,
    terms: (string-utf8 500),
    active: bool
  }
)

(define-map resource-revenue-shares
  { resource-hash: (buff 32), participant: principal }
  {
    percentage: uint,  ;; 0-100
    total-received: uint  ;; In microstacks or tokens
  }
)

;; Private Functions
(define-private (is-owner (resource-hash (buff 32)) (caller principal))
  (match (map-get? resource-registry {resource-hash: resource-hash})
    entry (is-eq (get creator entry) caller)
    false
  )
)

(define-private (validate-hash (hash (buff 32)))
  (is-eq (len hash) u32)
)

(define-private (validate-string-len (str (string-utf8 1000)) (max-len uint))
  (<= (len str) max-len)
)

;; Public Functions

;; Register a new OER resource
(define-public (register-resource 
  (resource-hash (buff 32)) 
  (title (string-utf8 100)) 
  (description (string-utf8 1000))
  (ipfs-hash (buff 46)))
  (let
    (
      (existing (map-get? resource-registry {resource-hash: resource-hash}))
    )
    (if (var-get contract-paused)
      (err ERR-PAUSED)
      (if (is-some existing)
        (err ERR-ALREADY-REGISTERED)
        (if (or 
              (not (validate-hash resource-hash))
              (not (validate-string-len title MAX-TITLE-LEN))
              (not (validate-string-len description MAX-DESC-LEN))
              (is-eq (len ipfs-hash) u0))
          (err ERR-INVALID-METADATA)
          (begin
            (map-set resource-registry
              {resource-hash: resource-hash}
              {
                creator: tx-sender,
                timestamp: block-height,
                title: title,
                description: description,
                ipfs-hash: ipfs-hash
              }
            )
            (map-set resource-status
              {resource-hash: resource-hash}
              {
                status: u"draft",
                visibility: false,
                last-updated: block-height
              }
            )
            (var-set total-resources (+ (var-get total-resources) u1))
            (ok true)
          )
        )
      )
    )
  )
)

;; Transfer ownership of a resource
(define-public (transfer-ownership (resource-hash (buff 32)) (new-owner principal))
  (let
    (
      (entry (map-get? resource-registry {resource-hash: resource-hash}))
    )
    (if (var-get contract-paused)
      (err ERR-PAUSED)
      (match entry
        some-entry
        (if (is-eq (get creator some-entry) tx-sender)
          (begin
            (map-set resource-registry
              {resource-hash: resource-hash}
              (merge some-entry {creator: new-owner})
            )
            (ok true)
          )
          (err ERR-NOT-OWNER)
        )
        (err ERR-INVALID-HASH)
      )
    )
  )
)

;; Register a new version of the resource
(define-public (register-version 
  (resource-hash (buff 32)) 
  (version uint)
  (updated-ipfs-hash (buff 46))
  (update-notes (string-utf8 500)))
  (if (var-get contract-paused)
    (err ERR-PAUSED)
    (if (is-owner resource-hash tx-sender)
      (if (or 
            (is-eq version u0)
            (not (validate-string-len update-notes MAX-UPDATE-NOTES-LEN))
            (is-eq (len updated-ipfs-hash) u0))
        (err ERR-INVALID-METADATA)
        (let
          (
            (existing-version (map-get? resource-versions {resource-hash: resource-hash, version: version}))
          )
          (if (is-some existing-version)
            (err ERR-ALREADY-REGISTERED)
            (begin
              (map-set resource-versions
                {resource-hash: resource-hash, version: version}
                {
                  updated-ipfs-hash: updated-ipfs-hash,
                  update-notes: update-notes,
                  timestamp: block-height
                }
              )
              (map-set resource-status
                {resource-hash: resource-hash}
                (merge 
                  (unwrap-panic (map-get? resource-status {resource-hash: resource-hash}))
                  {last-updated: block-height}
                )
              )
              (ok true)
            )
          )
        )
      )
      (err ERR-NOT-OWNER)
    )
  )
)

;; Grant a license to a resource
(define-public (grant-license 
  (resource-hash (buff 32))
  (licensee principal)
  (duration uint)
  (terms (string-utf8 500)))
  (if (var-get contract-paused)
    (err ERR-PAUSED)
    (if (is-owner resource-hash tx-sender)
      (if (or 
            (is-eq licensee tx-sender)
            (not (validate-string-len terms MAX-TERMS-LEN))
            (is-eq duration u0))
        (err ERR-INVALID-LICENSEE)
        (begin
          (map-set resource-licenses
            {resource-hash: resource-hash, licensee: licensee}
            {
              expiry: (+ block-height duration),
              terms: terms,
              active: true
            }
          )
          (ok true)
        )
      )
      (err ERR-NOT-OWNER)
    )
  )
)

;; Add category and tags to a resource
(define-public (add-category
  (resource-hash (buff 32))
  (category (string-utf8 50))
  (tags (list 10 (string-utf8 20))))
  (if (var-get contract-paused)
    (err ERR-PAUSED)
    (if (is-owner resource-hash tx-sender)
      (if (or 
            (not (validate-string-len category MAX-CATEGORY-LEN))
            (> (len tags) MAX-TAGS)
            (fold check-tag-length tags true))
        (err ERR-INVALID-CATEGORY)
        (begin
          (map-set resource-categories
            {resource-hash: resource-hash}
            {
              category: category,
              tags: tags
            }
          )
          (ok true)
        )
      )
      (err ERR-NOT-OWNER)
    )
  )
)

(define-private (check-tag-length (tag (string-utf8 20)) (acc bool))
  (and acc (<= (len tag) MAX-TAG-LEN))
)

;; Add a collaborator to a resource
(define-public (add-collaborator
  (resource-hash (buff 32))
  (collaborator principal)
  (role (string-utf8 50))
  (permissions (list 5 (string-utf8 20))))
  (if (var-get contract-paused)
    (err ERR-PAUSED)
    (if (is-owner resource-hash tx-sender)
      (if (or 
            (is-eq collaborator tx-sender)
            (not (validate-string-len role MAX-ROLE-LEN))
            (> (len permissions) MAX-PERMISSIONS)
            (fold check-perm-length permissions true))
        (err ERR-INVALID-COLLABORATOR)
        (begin
          (map-set resource-collaborators
            {resource-hash: resource-hash, collaborator: collaborator}
            {
              role: role,
              permissions: permissions,
              added-at: block-height
            }
          )
          (ok true)
        )
      )
      (err ERR-NOT-OWNER)
    )
  )
)

(define-private (check-perm-length (perm (string-utf8 20)) (acc bool))
  (and acc (<= (len perm) MAX-PERM-LEN))
)

;; Update resource status
(define-public (update-status
  (resource-hash (buff 32))
  (new-status (string-utf8 20))
  (visibility bool))
  (if (var-get contract-paused)
    (err ERR-PAUSED)
    (if (is-owner resource-hash tx-sender)
      (if (not (validate-string-len new-status MAX-STATUS-LEN))
        (err ERR-INVALID-STATUS)
        (begin
          (map-set resource-status
            {resource-hash: resource-hash}
            {
              status: new-status,
              visibility: visibility,
              last-updated: block-height
            }
          )
          (ok true)
        )
      )
      (err ERR-NOT-OWNER)
    )
  )
)

;; Set revenue share for a participant
(define-public (set-revenue-share
  (resource-hash (buff 32))
  (participant principal)
  (percentage uint))
  (if (var-get contract-paused)
    (err ERR-PAUSED)
    (if (is-owner resource-hash tx-sender)
      (if (or (> percentage u100) (is-eq percentage u0) (is-eq participant tx-sender))
        (err ERR-INVALID-SHARE)
        (begin
          (map-set resource-revenue-shares
            {resource-hash: resource-hash, participant: participant}
            {
              percentage: percentage,
              total-received: u0
            }
          )
          (ok true)
        )
      )
      (err ERR-NOT-OWNER)
    )
  )
)

;; Admin functions
(define-public (pause-contract)
  (if (is-eq tx-sender (var-get contract-admin))
    (begin
      (var-set contract-paused true)
      (ok true)
    )
    (err ERR-UNAUTHORIZED)
  )
)

(define-public (unpause-contract)
  (if (is-eq tx-sender (var-get contract-admin))
    (begin
      (var-set contract-paused false)
      (ok true)
    )
    (err ERR-UNAUTHORIZED)
  )
)

(define-public (set-admin (new-admin principal))
  (if (is-eq tx-sender (var-get contract-admin))
    (begin
      (var-set contract-admin new-admin)
      (ok true)
    )
    (err ERR-UNAUTHORIZED)
  )
)

;; Read-only Functions

(define-read-only (get-resource-details (resource-hash (buff 32)))
  (map-get? resource-registry {resource-hash: resource-hash})
)

(define-read-only (get-resource-version (resource-hash (buff 32)) (version uint))
  (map-get? resource-versions {resource-hash: resource-hash, version: version})
)

(define-read-only (get-resource-category (resource-hash (buff 32)))
  (map-get? resource-categories {resource-hash: resource-hash})
)

(define-read-only (get-resource-collaborator (resource-hash (buff 32)) (collaborator principal))
  (map-get? resource-collaborators {resource-hash: resource-hash, collaborator: collaborator})
)

(define-read-only (get-resource-status (resource-hash (buff 32)))
  (map-get? resource-status {resource-hash: resource-hash})
)

(define-read-only (get-resource-license (resource-hash (buff 32)) (licensee principal))
  (map-get? resource-licenses {resource-hash: resource-hash, licensee: licensee})
)

(define-read-only (get-resource-revenue-share (resource-hash (buff 32)) (participant principal))
  (map-get? resource-revenue-shares {resource-hash: resource-hash, participant: participant})
)

(define-read-only (get-total-resources)
  (var-get total-resources)
)

(define-read-only (is-contract-paused)
  (var-get contract-paused)
)

(define-read-only (get-contract-admin)
  (var-get contract-admin)
)

(define-read-only (verify-creator (resource-hash (buff 32)) (creator principal))
  (match (map-get? resource-registry {resource-hash: resource-hash})
    entry (is-eq (get creator entry) creator)
    false
  )
)

(define-read-only (check-license-active (resource-hash (buff 32)) (licensee principal))
  (match (map-get? resource-licenses {resource-hash: resource-hash, licensee: licensee})
    license (and (get active license) (>= (get expiry license) block-height))
    false
  )
)