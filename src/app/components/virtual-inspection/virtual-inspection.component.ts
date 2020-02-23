import { Component, OnInit, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { Camera, CameraOptions } from '@ionic-native/camera/ngx';
import { MediaCapture, CaptureVideoOptions, CaptureError } from '@ionic-native/media-capture/ngx';
import { Storage } from '@ionic/storage';
import { Media, MediaObject } from '@ionic-native/media/ngx';
import { File } from '@ionic-native/file/ngx';
import { Geolocation } from '@ionic-native/geolocation/ngx';
import { Subscription } from 'rxjs/internal/Subscription';
import { Platform } from '@ionic/angular';
import { filter } from 'rxjs/operators';
declare var google;
const MEDIA_FILES_KEY = 'mediaFiles';

@Component({
  selector: 'app-virtual-inspection',
  templateUrl: './virtual-inspection.component.html',
  styleUrls: ['./virtual-inspection.component.scss'],
})
export class VirtualInspectionComponent implements OnInit, AfterViewInit {

  @ViewChild('map', { static: false }) mapElement: ElementRef;
  map: any;
  currentMapTrack = null;

  isTracking = false;
  trackedRoute = [];
  previousTracks = [];

  positionSubscription: Subscription;

  capturedSnapURL: string;
  photos: any;
  mediaFiles = [];
  @ViewChild('myvideo', { static: false }) myVideo: any;

  cameraOptions: CameraOptions = {
    quality: 50, // picture quality
    destinationType: this.camera.DestinationType.DATA_URL,
    encodingType: this.camera.EncodingType.JPEG,
    mediaType: this.camera.MediaType.PICTURE
  }
  public loadProgress: number;
  isVirtual: boolean = true;
  isPhotoIns: boolean = false;
  isVideoIns: boolean = false;
  isLiveTracking: boolean = false;
  isViewTracking: boolean = false;
  constructor(private geolocation: Geolocation, private plt: Platform, private camera: Camera,
    private mediaCapture: MediaCapture,
    private storage: Storage,
    private file: File,
    private media: Media) {
  }
  ngAfterViewInit(): void {

  }

  ngOnInit() {
    this.loadProgress = 70;
    this.photos = [];
    setTimeout(() => {
      this.onViewDidLoad();
    }, 6000);
  }

  startInspection() {
    this.isVirtual = false;
    this.isPhotoIns = true;
  }

  takeSnap() {
    this.camera.getPicture(this.cameraOptions).then((imageData) => {
      // this.camera.DestinationType.FILE_URI gives file URI saved in local
      // this.camera.DestinationType.DATA_URL gives base64 URI

      let base64Image = 'data:image/jpeg;base64,' + imageData;
      this.photos.push(base64Image);
      this.photos.reverse();
      this.capturedSnapURL = base64Image;
    }, (err) => {
      console.log(err);
    });
  }

  onTakePhoto() {
    this.isPhotoIns = false;
    this.isVideoIns = true
    this.isVirtual = false;
  }


  ionViewDidLoad() {
    this.storage.get(MEDIA_FILES_KEY).then(res => {
      this.mediaFiles = JSON.parse(res) || [];
    })
  }

  captureAudio() {
    this.mediaCapture.captureAudio().then(res => {
      this.storeMediaFiles(res);
    }, (err: CaptureError) => console.error(err));
  }
  onTakeVideo() {
    let options: CaptureVideoOptions = {
      limit: 1,
      duration: 30
    }
    this.mediaCapture.captureVideo(options).then((res: any) => {
      let capturedFile = res[0];
      let fileName = capturedFile.name;
      let dir = capturedFile['localURL'].split('/');
      dir.pop();
      let fromDirectory = dir.join('/');
      var toDirectory = this.file.dataDirectory;

      this.file.copyFile(fromDirectory, fileName, toDirectory, fileName).then((res) => {
        this.storeMediaFiles([{ name: fileName, size: capturedFile.size }]);
      }, err => {
        console.log('err: ', err);
      });
    },
      (err: CaptureError) => console.error(err));
  }

  play(myFile) {
    if (myFile.name.indexOf('.wav') > -1) {
      const audioFile: MediaObject = this.media.create(myFile.localURL);
      audioFile.play();
    } else {
      let path = this.file.dataDirectory + myFile.name;
      let url = path.replace(/^file:\/\//, '');
      let video = this.myVideo.nativeElement;
      video.src = url;
      video.play();
    }
  }

  storeMediaFiles(files) {
    this.storage.get(MEDIA_FILES_KEY).then(res => {
      if (res) {
        let arr = JSON.parse(res);
        arr = arr.concat(files);
        this.storage.set(MEDIA_FILES_KEY, JSON.stringify(arr));
      } else {
        this.storage.set(MEDIA_FILES_KEY, JSON.stringify(files))
      }
      this.mediaFiles = this.mediaFiles.concat(files);
    })
  }

  recordDriving() {
    this.isVideoIns = false;
    this.isLiveTracking = true;
  }
  onDriveRecord() {
    this.isLiveTracking = false;
    this.isViewTracking = true;
  }

  onViewDidLoad() {
    this.plt.ready().then(() => {
      this.loadHistoricRoutes();

      let mapOptions = {
        zoom: 8,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
      }
      this.map = new google.maps.Map(this.mapElement.nativeElement, mapOptions);
      console.log(this.map)
      this.geolocation.getCurrentPosition().then(pos => {
        let latLng = new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
        google.maps.event.addListenerOnce(this.map, 'idle', () => {
          let marker = new google.maps.Marker({
            position: latLng,
            map: this.map,
          });
        });
        this.map.setCenter(latLng);
        this.map.setZoom(18);
      }).catch((error) => {
        console.log('Error getting location', error);
      });
    });
  }

  loadHistoricRoutes() {
    this.storage.get('routes').then(data => {
      if (data) {
        this.previousTracks = data;
      }
    });
  }

  startTracking() {
    this.isTracking = true;
    this.trackedRoute = [];

    this.positionSubscription = this.geolocation.watchPosition()
      .pipe(
        filter((p) => p.coords !== undefined) //Filter Out Errors
      )
      .subscribe(data => {
        setTimeout(() => {
          this.trackedRoute.push({ lat: data.coords.latitude, lng: data.coords.longitude });
          this.redrawPath(this.trackedRoute);
        }, 0);
      });

  }

  redrawPath(path) {
    if (this.currentMapTrack) {
      this.currentMapTrack.setMap(null);
    }

    if (path.length > 1) {
      this.currentMapTrack = new google.maps.Polyline({
        path: path,
        geodesic: true,
        strokeColor: '#ff00ff',
        strokeOpacity: 1.0,
        strokeWeight: 3
      });
      this.currentMapTrack.setMap(this.map);
    }
  }
  stopTracking() {
    let newRoute = { finished: new Date().getTime(), path: this.trackedRoute };
    this.previousTracks.push(newRoute);
    this.storage.set('routes', this.previousTracks);

    this.isTracking = false;
    this.positionSubscription.unsubscribe();
    this.currentMapTrack.setMap(null);
  }

  showHistoryRoute(route) {
    this.redrawPath(route);
  }
}
